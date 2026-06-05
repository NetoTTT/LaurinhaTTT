import type { ChatCompletionTool } from 'openai/resources/chat';
import { upsertUser } from '../db/users.repository';
import { getUserStickers, getStickerData, getRandomStickerData, getRandomStickerWithId } from '../db/catalog.repository';
import { executeMemoryTool } from '../memory/tools';
import { webSearchWithUrls } from './search';
import { publishOutbound } from '../bus/redis';
import { bufferToBase64 } from '../media/sticker.service';
import { textToSpeech } from '../media/tts.service';
import { writePage, readPage } from '../media/pages.service';
import { buildPageHTML } from './page-builder';
import { config } from '../config';
import { teachSticker, forgetSticker } from './sticker-knowledge';
import { logPageAction, getPageHistory } from './page-history';

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Validação de URL para clonagem ───────────────────────────────────────────

const BLOCKED_KEYWORDS = [
  // Adulto / pornografia
  'porn', 'xxx', 'sex', 'nude', 'naked', 'adult', 'nsfw', 'hentai', 'onlyfans',
  'xvideos', 'xnxx', 'xhamster', 'pornhub', 'redtube', 'youporn', 'brazzers',
  'lesbians', 'milf', 'fetish', 'escorts', 'webcam', 'camgirl', 'stripper',
  // Apostas / cassino
  'casino', 'poker', 'slots', 'apostas', 'betonline', 'betano', '1xbet',
  // Phishing / scam comuns
  'free-money', 'earn-cash', 'click-here-win', 'crypto-giveaway',
  // Drogas
  'cocaine', 'heroin', 'methamphetamine', 'cannabis-shop', 'buy-weed',
];

const BLOCKED_TLDS = ['.xxx', '.adult', '.sex', '.porn'];

function validateCloneUrl(rawUrl: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'só URLs http/https são permitidas' };
  }

  const fullUrl = rawUrl.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // Verifica TLDs bloqueados
  for (const tld of BLOCKED_TLDS) {
    if (hostname.endsWith(tld)) {
      return { ok: false, reason: 'domínio bloqueado' };
    }
  }

  // Verifica keywords na URL inteira
  for (const kw of BLOCKED_KEYWORDS) {
    if (fullUrl.includes(kw)) {
      return { ok: false, reason: 'conteúdo não permitido' };
    }
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────────

const PAGE_CREATE_COOLDOWN_MS = 60 * 60 * 1000;
const PAGE_UPDATE_COOLDOWN_MS = 10 * 60 * 1000;

export const pageCreateCooldowns = new Map<string, number>();
export const pageUpdateCooldowns = new Map<string, number>();
export const userPageSlug = new Map<string, string>();
const buildsInProgress = new Set<string>();

function injectCloneBadge(html: string, originalUrl: string): string {
  const badge = `
<!-- badge de origem — injetado automaticamente em páginas clonadas -->
<style>
#__clone-badge{position:fixed;bottom:18px;right:18px;z-index:99999;display:flex;align-items:center;gap:0;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:999px;padding:7px 10px;cursor:pointer;text-decoration:none;color:rgba(255,255,255,.85);font-family:-apple-system,'Segoe UI',sans-serif;font-size:11px;font-weight:500;letter-spacing:.02em;border:1px solid rgba(255,255,255,.12);box-shadow:0 2px 12px rgba(0,0,0,.25);overflow:hidden;max-width:32px;transition:max-width .35s cubic-bezier(.4,0,.2,1),background .2s,padding .35s cubic-bezier(.4,0,.2,1);white-space:nowrap}
#__clone-badge:hover{max-width:200px;background:rgba(0,0,0,.75);padding:7px 14px}
#__clone-badge svg{flex-shrink:0;opacity:.75;transition:opacity .2s}
#__clone-badge:hover svg{opacity:1}
#__clone-badge span{overflow:hidden;max-width:0;opacity:0;transition:max-width .35s cubic-bezier(.4,0,.2,1),opacity .2s .1s,margin .35s;margin-left:0}
#__clone-badge:hover span{max-width:160px;opacity:1;margin-left:6px}
</style>
<a id="__clone-badge" href="${originalUrl}" target="_blank" rel="noopener noreferrer" title="Ver página original">
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
<span>Ver original</span>
</a>`;

  // Injeta antes do </body>; se não tiver </body>, adiciona no final
  if (html.includes('</body>')) {
    return html.replace('</body>', `${badge}\n</body>`);
  }
  return html + badge;
}

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
      description: 'Envia uma figurinha ALEATÓRIA do acervo. Use só como ÚLTIMO RECURSO — quando nenhuma das figurinhas conhecidas (listadas no contexto) se encaixa no momento.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'teach_sticker',
      description: 'Aprende o significado de uma figurinha. Chame quando o usuário ensinar o que uma figurinha significa (ex: "essa é boa pra drama") ou quando você enviou uma e o usuário explicou o que ela representa. Use o ID numérico da figurinha.',
      parameters: {
        type: 'object',
        properties: {
          sticker_id: { type: 'number', description: 'ID numérico da figurinha (ex: 42). Visível em [enviou figurinha #42] no histórico.' },
          description: { type: 'string', description: 'O que essa figurinha representa e quando usar. Ex: "gato chorando - usar em situações de drama, tristeza exagerada, perda"' },
        },
        required: ['sticker_id', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget_sticker',
      description: 'Remove o conhecimento sobre uma figurinha. Use quando a descrição estiver errada.',
      parameters: {
        type: 'object',
        properties: {
          sticker_id: { type: 'number', description: 'ID da figurinha a esquecer' },
        },
        required: ['sticker_id'],
      },
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
      name: 'get_page_info',
      description: 'Retorna o histórico do que foi feito num site (criação, edições, clones). Use quando o usuário perguntar "o que você fez nesse site", "como foi feito", "quais mudanças teve" etc.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Nome do site na URL (ex: para laurinha.asktome.com.br/roleta-humanits, o slug é "roleta-humanits")' },
        },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_page',
      description: 'Cria uma página web pública. Se o usuário passar uma URL externa, use source_url para clonar e modificar aquela página. Sem source_url, gera do zero.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Nome curto que vai na URL. Só letras minúsculas, números e hifens.' },
          description: { type: 'string', description: 'O que criar ou modificar. Se clonando, descreva as mudanças em relação ao original.' },
          source_url: { type: 'string', description: 'URL externa para clonar (opcional). Ex: "https://exemplo.com". O sistema baixa o HTML e usa como base para aplicar as modificações da description.' },
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
    const result = await getRandomStickerWithId();
    if (!result) return { type: 'text', text: 'Sem figurinhas no acervo ainda.' };
    return { type: 'sticker', mediaFileId: result.id, data: result.data };
  }

  if (name === 'teach_sticker') {
    const { sticker_id, description } = input as { sticker_id: number; description: string };
    const addedBy = ctx?.displayName ?? 'alguém';
    teachSticker(sticker_id, description, addedBy);
    return { type: 'text', text: `aprendi: #${sticker_id} → "${description}"` };
  }

  if (name === 'forget_sticker') {
    const { sticker_id } = input as { sticker_id: number };
    const removed = forgetSticker(sticker_id);
    return { type: 'text', text: removed ? `esqueci a figurinha #${sticker_id}` : `não conhecia #${sticker_id}` };
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

  // Histórico do que foi feito num site (não precisa de ctx)
  if (name === 'get_page_info') {
    const { slug } = input as { slug: string };
    const history = getPageHistory(slug);
    if (!history) return { type: 'text', text: `não tenho registro do que foi feito em "${slug}" (talvez tenha sido criado antes do log existir)` };
    return { type: 'text', text: `Histórico de "${slug}":\n\n${history}` };
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
      const { slug, description, source_url } = input as { slug: string; description: string; source_url?: string };
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
          // Se tem source_url, valida e baixa o HTML original para usar como base
          let sourceHtml: string | undefined;
          if (source_url) {
            const urlCheck = validateCloneUrl(source_url);
            if (!urlCheck.ok) {
              console.warn(`[pages] URL bloqueada: ${source_url} — ${urlCheck.reason}`);
              await publishOutbound({ chatId, platform, content: { type: 'text', text: `nao posso clonar esse site (${urlCheck.reason})` } });
              return;
            }
            try {
              console.log(`[pages] baixando HTML de: ${source_url}`);
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 10_000);
              const res = await fetch(source_url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaurinhaBot/1.0)' },
              });
              clearTimeout(timeout);
              const raw = await res.text();
              // Limita para não explodir o contexto do page-builder
              sourceHtml = raw.slice(0, 80_000);
              console.log(`[pages] HTML baixado: ${raw.length} chars de ${source_url}`);
            } catch (fetchErr) {
              console.error('[pages] erro ao baixar source_url:', (fetchErr as Error).message);
              await publishOutbound({ chatId, platform, content: { type: 'text', text: `nao consegui acessar ${source_url}, tenta com outro link` } });
              return;
            }
          }

          console.log(`[pages] gerando HTML (background): "${description.slice(0, 80)}"${source_url ? ' (clonando)' : ''}`);
          let html = await buildPageHTML(description, sourceHtml);
          if (source_url) html = injectCloneBadge(html, source_url);
          const url = writePage(slug, html);
          // Salva dono mesmo para owner
          userPageSlug.set(userId, slug);
          saveUserSlugs();
          console.log(`[pages] criada: ${url}`);
          logPageAction({
            slug,
            action: source_url ? 'clone' : 'criação',
            by: ctx.displayName,
            description,
            sourceUrl: source_url,
          });
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
            logPageAction({ slug: forkSlug, action: 'fork', by: ctx.displayName, description: `fork de "${slug}": ${instruction}` });
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
          logPageAction({ slug, action: 'edição', by: ctx.displayName, description: instruction });
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
