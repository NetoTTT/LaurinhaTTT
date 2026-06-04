import type { ChatCompletionTool } from 'openai/resources/chat';
import { upsertUser } from '../db/users.repository';
import { getUserStickers, getStickerData, getRandomStickerData } from '../db/catalog.repository';
import { executeMemoryTool } from '../memory/tools';
import { webSearchWithUrls } from './search';
import { publishOutbound } from '../bus/redis';
import { bufferToBase64 } from '../media/sticker.service';
import { textToSpeech } from '../media/tts.service';
import { writePage, readPage } from '../media/pages.service';
import { buildPageHTML } from './page-builder';
import { config } from '../config';

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PAGE_CREATE_COOLDOWN_MS = 60 * 60 * 1000;
const PAGE_UPDATE_COOLDOWN_MS = 10 * 60 * 1000;

export const pageCreateCooldowns = new Map<string, number>();
export const pageUpdateCooldowns = new Map<string, number>();
export const userPageSlug = new Map<string, string>();
const buildsInProgress = new Set<string>();

// Persiste mapeamento userId→slug em disco
const SLUGS_FILE = join(process.env.PAGES_DIR ?? '/home/lourival/Documentos/LaurinhaTTT/public/pages', '.user-slugs.json');

function loadUserSlugs(): void {
  try {
    if (existsSync(SLUGS_FILE)) {
      const data = JSON.parse(readFileSync(SLUGS_FILE, 'utf-8')) as Record<string, string>;
      for (const [k, v] of Object.entries(data)) userPageSlug.set(k, v);
      console.log(`[pages] ${userPageSlug.size} user slugs carregados`);
    }
  } catch { /* ignora */ }
}

export function saveUserSlugs(): void {
  try {
    const data = Object.fromEntries(userPageSlug);
    writeFileSync(SLUGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* ignora */ }
}

loadUserSlugs();

export interface ToolContext {
  platform: string;
  platformId: string;
  chatId: string;
  displayName: string;
}

export const searchTool: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Busca informações na internet. Use quando precisar de dados atuais, notícias ou fatos que não sabe. A query deve ser curta e objetiva, como você digitaria num buscador — ex: "preço dólar hoje", "quem é Elon Musk", "tempo São Paulo amanhã".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca curto e objetivo (máx 10 palavras)' },
        },
        required: ['query'],
      },
    },
  },
];

export const stickerTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_random_sticker',
      description: 'Envia uma figurinha aleatória do acervo. Use quando quiser mandar uma figurinha espontaneamente, sem que o usuário pediu uma específica.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_stickers',
      description: 'Lista as figurinhas salvas de um usuário específico. Use quando alguém pedir pra ver ou mandar uma figurinha salva.',
      parameters: {
        type: 'object',
        properties: {
          platform_id: { type: 'string', description: 'ID do usuário na plataforma (ex: 557583439297@c.us)' },
          platform: { type: 'string', description: 'Plataforma do usuário (whatsapp)' },
        },
        required: ['platform_id', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_sticker',
      description: 'Envia uma figurinha salva para o chat. Use o media_file_id obtido de get_user_stickers.',
      parameters: {
        type: 'object',
        properties: {
          media_file_id: { type: 'number', description: 'ID da figurinha a enviar' },
        },
        required: ['media_file_id'],
      },
    },
  },
];

export const memoryWriteTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'memory_add_note',
      description: 'Adiciona uma nota rápida sobre o usuário atual. Use para registrar algo potencialmente importante sem interromper a conversa.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Nota concisa (uma linha)' },
        },
        required: ['note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_write_section',
      description: 'Atualiza uma seção da memória do usuário. Use com alta certeza — fato confirmado 2+ vezes ou declarado explicitamente.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            description: 'Seção: "Perfil", "Como Interagir", "Relacionamentos", "Contexto Atual" ou "Memórias"',
          },
          content: { type: 'string', description: 'Novo conteúdo completo da seção em markdown (bullets curtos)' },
        },
        required: ['section', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_set_name',
      description: 'Registra como este usuário quer chamar a Laura. Use quando o usuário pedir explicitamente para chamá-la por outro nome.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome preferido (ex: "Lara", "Lu")' },
        },
        required: ['name'],
      },
    },
  },
];

export const webTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_page',
      description: 'Cria uma página web pública a partir de uma descrição e retorna o link. Use para jogos, rankings, formulários, visualizações, qualquer coisa visual/interativa. Descreva o que quer — um builder dedicado gera o HTML com mais tokens.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Nome curto que vai na URL (ex: "ranking-do-grupo", "jogo-da-forca"). Só letras minúsculas, números e hifens. É a parte depois de laurinha.asktome.com.br/' },
          description: { type: 'string', description: 'Descrição detalhada do que a página deve ser/fazer. Quanto mais detalhes, melhor o resultado.' },
        },
        required: ['slug', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_page',
      description: 'Lê o HTML atual de uma página existente. Use antes de update_page para ver o que está lá.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Nome do site na URL (ex: para laurinha.asktome.com.br/jogo-do-kakau, o nome é "jogo-do-kakau")' },
        },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_page',
      description: 'Corrige ou atualiza uma página existente. O usuário deve ter fornecido o link completo. Extrai o nome da URL (parte depois de laurinha.asktome.com.br/) e passa como slug.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Nome do site na URL — extraído do link que o usuário forneceu (ex: link "laurinha.asktome.com.br/meu-jogo" → slug "meu-jogo")' },
          instruction: { type: 'string', description: 'O que corrigir/mudar/adicionar na página' },
        },
        required: ['slug', 'instruction'],
      },
    },
  },
];

export const audioTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_audio',
      description: 'Envia uma mensagem de voz (áudio) no lugar de texto. Use RARAMENTE — apenas 1 vez a cada muitas mensagens, quando der um impacto especial (resposta dramática, zoeira, surpresa). Máx 300 caracteres. Nunca use para respostas simples ou corriqueiras.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto a converter em voz (máx 300 chars, informal, sem emojis)' },
        },
        required: ['text'],
      },
    },
  },
];

export const schedulingTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'schedule_message',
      description: 'Agenda envio de uma mensagem com delay. Use para enviar algo (figurinha, texto, etc) alguns segundos depois. Perfeito para criar efeito dramático, esperar reação, ou separar mensagens. Delay em millisegundos: 1000=1s, 3000=3s, 5000=5s.',
      parameters: {
        type: 'object',
        properties: {
          delay: { type: 'number', description: 'Delay em ms (500-30000, ex: 3000 para 3s)' },
          type: { type: 'string', enum: ['text', 'sticker'], description: 'Tipo: texto ou figurinha' },
          text: { type: 'string', description: 'Texto a enviar (se type=text)' },
          sticker_id: { type: 'number', description: 'ID da figurinha (se type=sticker)' },
        },
        required: ['delay', 'type'],
      },
    },
  },
];

export const tools: ChatCompletionTool[] = [...searchTool, ...stickerTools, ...memoryWriteTools, ...webTools, ...audioTools, ...schedulingTools];

export interface TextToolResult { type: 'text'; text: string }
export interface StickerToolResult { type: 'sticker'; mediaFileId: number; data: Buffer }
export interface AudioToolResult { type: 'audio'; data: Buffer; text: string }
export type ToolResult = TextToolResult | StickerToolResult | AudioToolResult;

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<ToolResult> {
  // Web search
  if (name === 'web_search') {
    const { query } = input as { query: string };
    console.log(`[search] query: "${query}"`);
    const { text, urls } = await webSearchWithUrls(query);
    console.log(`[search] result (${text.length} chars, ${urls.length} urls):\n${text.substring(0, 500)}`);
    const urlBlock = urls.length ? `\n\nLinks:\n${urls.join('\n')}` : '';
    return { type: 'text', text: text + urlBlock };
  }

  // Sticker tools
  if (name === 'send_random_sticker') {
    const data = await getRandomStickerData();
    if (!data) return { type: 'text', text: 'Sem figurinhas no acervo ainda.' };
    return { type: 'sticker', mediaFileId: -1, data };
  }

  if (name === 'get_user_stickers') {
    const { platform_id, platform } = input as { platform_id: string; platform: string };
    const user = await upsertUser(platform, platform_id, platform_id);
    const stickers = await getUserStickers(user.id);
    if (stickers.length === 0) {
      return { type: 'text', text: 'Usuário não tem figurinhas salvas ainda.' };
    }
    const list = stickers.map(s =>
      `ID: ${s.media_file_id} | ${Math.round(s.size / 1024)}KB | ${new Date(s.saved_at).toLocaleDateString('pt-BR')}`,
    ).join('\n');
    return { type: 'text', text: `Figurinhas salvas:\n${list}` };
  }

  if (name === 'send_sticker') {
    const { media_file_id } = input as { media_file_id: number };
    const data = await getStickerData(media_file_id);
    if (!data) return { type: 'text', text: 'Figurinha não encontrada.' };
    return { type: 'sticker', mediaFileId: media_file_id, data };
  }

  // Memory write tools — injetam platform/platformId do contexto da mensagem
  if (['memory_add_note', 'memory_write_section', 'memory_set_name'].includes(name) && ctx) {
    const fullInput = { ...input, platform: ctx.platform, platform_id: ctx.platformId };
    const result = await executeMemoryTool(name, fullInput);

    if (result.needsCompaction) {
      // Fire-and-forget — não bloqueia a resposta
      import('../memory/compact').then(({ compactViaBackend }) =>
        compactViaBackend(ctx.platform, ctx.platformId).catch(console.error),
      );
    }

    return { type: 'text', text: result.output };
  }

  // Web page tools
  if ((name === 'create_page' || name === 'update_page' || name === 'read_page') && ctx) {
    const isOwner = config.ownerPlatformIds.includes(ctx.platformId);
    const platform = ctx.platform as 'whatsapp' | 'discord' | 'telegram';
    const chatId = ctx.chatId;
    const userId = ctx.platformId;

    if (name === 'read_page') {
      const { slug } = input as { slug: string };
      const html = readPage(slug);
      if (!html) return { type: 'text', text: `Página "${slug}" não encontrada.` };
      const preview = html.length > 6000 ? html.slice(0, 6000) + '\n...[truncado]' : html;
      return { type: 'text', text: preview };
    }

    if (name === 'create_page') {
      const { slug, description } = input as { slug: string; description: string };
      if (!slug || !description) return { type: 'text', text: 'create_page: slug e description são obrigatórios' };

      // Build já em andamento pra esse slug?
      if (buildsInProgress.has(slug)) {
        return { type: 'text', text: `a pagina "${slug}" ja ta sendo criada, aguarda um segundo` };
      }

      if (!isOwner) {
        const lastCreate = pageCreateCooldowns.get(userId);
        if (lastCreate && Date.now() - lastCreate < PAGE_CREATE_COOLDOWN_MS) {
          const remaining = Math.ceil((PAGE_CREATE_COOLDOWN_MS - (Date.now() - lastCreate)) / 60000);
          // Tem site próprio? Sugere atualizar
          const ownSlug = userPageSlug.get(userId);
          if (ownSlug) {
            return { type: 'text', text: `voce ja criou um site (${ownSlug}). pra criar outro espera ${remaining}min. mas pode pedir pra atualizar o seu a cada 10min` };
          }
          return { type: 'text', text: `pode criar outro site em ${remaining}min` };
        }
      }

      if (!isOwner) {
        pageCreateCooldowns.set(userId, Date.now());
        userPageSlug.set(userId, slug);
        saveUserSlugs();
      }

      buildsInProgress.add(slug);

      (async () => {
        try {
          console.log(`[pages] gerando HTML (background): "${description.slice(0, 80)}"`);
          const html = await buildPageHTML(description);
          const url = writePage(slug, html);
          // Salva dono mesmo para owner
          userPageSlug.set(userId, slug);
          saveUserSlugs();
          console.log(`[pages] criada: ${url}`);
          await publishOutbound({ chatId, platform, content: { type: 'text', text: `pronto, acessa aqui: ${url}` } });
        } catch (err) {
          console.error('[pages] erro ao criar:', (err as Error).message);
          await publishOutbound({ chatId, platform, content: { type: 'text', text: 'deu erro ao criar a pagina, tenta de novo' } });
        } finally {
          buildsInProgress.delete(slug);
        }
      })();

      return { type: 'text', text: 'ok, to criando agora. aviso quando ficar pronto' };
    }

    if (name === 'update_page') {
      const { slug, instruction } = input as { slug: string; instruction: string };
      if (!slug || !instruction) return { type: 'text', text: 'update_page: slug e instruction são obrigatórios' };

      const existing = readPage(slug);
      if (!existing) {
        const ownSlug = userPageSlug.get(userId);
        return { type: 'text', text: ownSlug
          ? `site "${slug}" nao encontrado. o seu site é ${config.pagesBaseUrl}/${ownSlug} — quer modificar esse?`
          : `site "${slug}" nao encontrado.` };
      }

      const ownSlug = userPageSlug.get(userId);
      const isPageOwner = isOwner || ownSlug === slug;

      if (!isPageOwner) {
        // Não é dono — fork: cria nova página copiando o original + instrução
        if (!isOwner) {
          const lastCreate = pageCreateCooldowns.get(userId);
          if (lastCreate && Date.now() - lastCreate < PAGE_CREATE_COOLDOWN_MS) {
            const remaining = Math.ceil((PAGE_CREATE_COOLDOWN_MS - (Date.now() - lastCreate)) / 60000);
            const siteInfo = ownSlug ? ` (${config.pagesBaseUrl}/${ownSlug})` : '';
            return { type: 'text', text: `voce ja tem um site${siteInfo}. pra fazer outro espera ${remaining}min` };
          }
        }

        // Gera slug único para o fork
        const userSuffix = userId.replace(/@.*$/, '').slice(-4);
        let forkSlug = `${slug}-${userSuffix}`;
        let counter = 1;
        while (readPage(forkSlug) || buildsInProgress.has(forkSlug)) {
          forkSlug = `${slug}-${userSuffix}-${counter++}`;
        }

        if (!isOwner) {
          pageCreateCooldowns.set(userId, Date.now());
          userPageSlug.set(userId, forkSlug);
          saveUserSlugs();
        }

        buildsInProgress.add(forkSlug);

        (async () => {
          try {
            console.log(`[pages] fork (background) "${slug}" → "${forkSlug}": "${instruction.slice(0, 80)}"`);
            const html = await buildPageHTML(instruction, existing);
            const url = writePage(forkSlug, html);
            userPageSlug.set(userId, forkSlug);
            saveUserSlugs();
            console.log(`[pages] fork criado: ${url}`);
            await publishOutbound({ chatId, platform, content: { type: 'text', text: `pronto, fiz uma versao sua com as mudancas: ${url}` } });
          } catch (err) {
            console.error('[pages] erro ao criar fork:', (err as Error).message);
            await publishOutbound({ chatId, platform, content: { type: 'text', text: 'deu erro ao criar o fork, tenta de novo' } });
          } finally {
            buildsInProgress.delete(forkSlug);
          }
        })();

        return { type: 'text', text: `voce nao e dono de "${slug}", criando uma versao sua com as modificacoes. aviso quando ficar pronto` };
      }

      // Usuário É o dono — atualiza normalmente
      const lastUpdate = pageUpdateCooldowns.get(userId);
      if (!isOwner && lastUpdate && Date.now() - lastUpdate < PAGE_UPDATE_COOLDOWN_MS) {
        const remaining = Math.ceil((PAGE_UPDATE_COOLDOWN_MS - (Date.now() - lastUpdate)) / 60000);
        return { type: 'text', text: `pode atualizar de novo em ${remaining}min` };
      }

      if (buildsInProgress.has(slug)) {
        return { type: 'text', text: `a pagina "${slug}" ja ta sendo atualizada, aguarda` };
      }

      if (!isOwner) pageUpdateCooldowns.set(userId, Date.now());
      buildsInProgress.add(slug);

      (async () => {
        try {
          console.log(`[pages] atualizando (background) "${slug}": "${instruction.slice(0, 80)}"`);
          const html = await buildPageHTML(instruction, existing);
          const url = writePage(slug, html);
          console.log(`[pages] atualizada: ${url}`);
          await publishOutbound({ chatId, platform, content: { type: 'text', text: `atualizado, acessa: ${url}` } });
        } catch (err) {
          console.error('[pages] erro ao atualizar:', (err as Error).message);
          await publishOutbound({ chatId, platform, content: { type: 'text', text: 'deu erro ao atualizar, tenta de novo' } });
        } finally {
          buildsInProgress.delete(slug);
        }
      })();

      return { type: 'text', text: 'ok, atualizando agora. aviso quando ficar pronto' };
    }
  }

  // Audio tool — envia mensagem de voz via Resemble AI
  if (name === 'send_audio') {
    const { text } = input as { text: string };
    if (!text?.trim()) return { type: 'text', text: 'send_audio: text obrigatório' };
    const truncated = text.trim().slice(0, 300);
    try {
      console.log(`[tts] gerando áudio para: "${truncated.substring(0, 60)}"`);
      const audioData = await textToSpeech(truncated);
      console.log(`[tts] áudio gerado: ${audioData.length} bytes`);
      if (audioData.length < 1000) throw new Error('áudio muito pequeno, provável falha silenciosa');
      return { type: 'audio', data: audioData, text: truncated };
    } catch (err) {
      console.error('[tts] erro, caindo pra texto:', (err as Error).message);
      return { type: 'text', text: truncated };
    }
  }

  // Schedule message tool — para enviar com delay
  if (name === 'schedule_message' && ctx) {
    const { delay, type: msgType, text, sticker_id } = input as {
      delay: number;
      type: 'text' | 'sticker';
      text?: string;
      sticker_id?: number;
    };

    // Validar delay
    const validDelay = Math.max(500, Math.min(30000, delay));

    if (msgType === 'text' && !text) {
      return { type: 'text', text: 'schedule_message: text é obrigatório quando type=text' };
    }

    if (msgType === 'sticker' && !sticker_id) {
      return { type: 'text', text: 'schedule_message: sticker_id é obrigatório quando type=sticker' };
    }

    // Agendar (fire-and-forget)
    setTimeout(async () => {
      try {
        const platform = ctx.platform as 'whatsapp' | 'discord' | 'telegram';
        if (msgType === 'text') {
          await publishOutbound({
            chatId: ctx.chatId,
            platform,
            content: { type: 'text', text: text! },
          });
        } else if (msgType === 'sticker' && sticker_id) {
          const stickerData = await getStickerData(sticker_id);
          if (stickerData) {
            await publishOutbound({
              chatId: ctx.chatId,
              platform,
              content: {
                type: 'sticker',
                media: {
                  mimetype: 'image/webp',
                  base64: bufferToBase64(stickerData),
                },
              },
            });
          }
        }
        console.log(`[schedule_message] ✓ enviada após ${validDelay}ms`);
      } catch (err) {
        console.error(`[schedule_message] erro ao enviar:`, err);
      }
    }, validDelay);

    return { type: 'text', text: `✓ Agendado para ${validDelay}ms` };
  }

  return { type: 'text', text: `Tool desconhecida: ${name}` };
}
