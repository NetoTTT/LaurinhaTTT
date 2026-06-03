import type { ChatCompletionTool } from 'openai/resources/chat';
import { upsertUser } from '../db/users.repository';
import { getUserStickers, getStickerData, getRandomStickerData } from '../db/catalog.repository';
import { executeMemoryTool } from '../memory/tools';
import { webSearchWithUrls } from './search';

export interface ToolContext {
  platform: string;
  platformId: string;
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

export const tools: ChatCompletionTool[] = [...searchTool, ...stickerTools, ...memoryWriteTools];

export interface TextToolResult { type: 'text'; text: string }
export interface StickerToolResult { type: 'sticker'; mediaFileId: number; data: Buffer }
export type ToolResult = TextToolResult | StickerToolResult;

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

  return { type: 'text', text: `Tool desconhecida: ${name}` };
}
