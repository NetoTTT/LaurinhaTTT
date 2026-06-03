import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { config } from '../config';
import { tools, memoryWriteTools, executeTool, type StickerToolResult, type ToolContext } from './tools';
import { getMemoryForContext } from '../memory/engine';
import { webSearchWithUrls } from './search';
import type { ConversationMessage } from '../db/context.repository';
import { getActiveProvider, getAllProviders, type AIProviderConfig } from './providers';

function loadXingamentos(): string {
  if (!existsSync(config.xingamentosPath)) return '';
  const words = readFileSync(config.xingamentosPath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(', ');
  if (!words) return '';
  return `\n- Pode e deve usar linguagem informal e palavrões quando combinar com o clima da conversa: ${words}`;
}

const XINGAMENTOS_EXTRA = loadXingamentos();

const SYSTEM_PROMPT = `Você é Laura, uma pessoa do grupo do WhatsApp. Age como qualquer amiga agiria — espontânea, engraçada, sem filtro quando a situação pede.

### NUNCA dizer — são frases de robô:
- "Como posso te ajudar?"
- "Estou aqui para te ouvir"
- "Sinto muito que você tenha passado por isso"
- "Você merece respeito e amor"
- "Eu não posso fazer isso"
- "Posso ajudar a encontrar recursos"
- Qualquer coisa longa e empática que um assistente diria

### Regras — IMPORTANTE:
- Resposta curta, 1-2 linhas no máximo, estilo WhatsApp
- Português brasileiro informal
- Xinga e zoa junto quando pedirem — é um grupo de amigos, não é psicóloga
- Se quiser ajudar de verdade, faz isso em 1 linha, sem drama
- Não se identifique como IA a menos que perguntada diretamente
- Ferramentas de figurinhas: use quando pedirem — ao mandar figurinha, SEMPRE fale algo junto (antes ou depois)
- Quando usar web_search: pode dar uma resposta mais completa com o que encontrou, não precisa ser curtíssima
- Quando usar web_search e encontrar algo útil, pode compartilhar o link junto com a explicação
- NUNCA adicione comentários depois da resposta ("você pode...", "se precisar...", "estou aqui...")
- A resposta TERMINA na primeira mensagem. Sem meta-texto, sem sugestões extras
- ZERO emojis. Nunca use emojis. Nem um sequer${XINGAMENTOS_EXTRA}`;

// Remove thinking/reasoning tokens that some models leak into output
function stripThinking(text: string): string {
  return text
    .replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi, '')
    .replace(/\[TOOL_RESULT\][\s\S]*?\[END_TOOL_RESULT\]/gi, '')
    .replace(/\[tool_call[\s\S]*?\]/gi, '')
    .trim();
}

// Padrões que indicam meta-comentário de assistente após a resposta real
const ASSISTANT_SUFFIX_RE = /\n+\*?\n*(você pode|se precisar|estou aqui|posso (te |te )?ajudar|qualquer (outra |)coisa|sinta-se|fique à vontade|caso queira|se quiser|precisa de (mais |)ajuda|a resposta (d[ao] laura|foi)|como (posso|gostaria))/i;

function trimAssistantSuffix(text: string): string {
  const match = text.search(ASSISTANT_SUFFIX_RE);
  return match > 0 ? text.slice(0, match).trim() : text;
}

const REFUSAL_RE = /\b(não (xingo|posso xingar|vou xingar)|isso (é|seria) (o limite|inadequado|inapropriado)|não (é|me parece) (certo|adequado|apropriado)|não (consigo|vou) (dizer|falar) (isso|palavrão)|isso está (fora|além) (do|dos) (meu|minha|limites?))\b/i;

function isRefusal(text: string): boolean {
  return REFUSAL_RE.test(text);
}

function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const MEMORY_REFLECTION_PROMPT = `Você acabou de ter uma troca com um usuário. Analise a conversa e decida se aprendeu algo que vale salvar na memória.

Salve se houver: nome, idade, profissão, cidade, relacionamentos, preferências, eventos marcantes, contexto atual ou qualquer fato que ajude a conhecer melhor essa pessoa.

Use memory_add_note para fatos soltos ou novidades.
Use memory_write_section para atualizar uma seção consolidada.
Não salve nada se a conversa foi trivial (cumprimentos, zoeiras sem conteúdo).
Responda APENAS com chamadas de tool ou com exatamente "nada".`;

async function reflectMemory(
  ctx: ToolContext,
  conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  provider: AIProviderConfig,
): Promise<void> {
  try {
    const response = await provider.client.chat.completions.create({
      model: provider.model,
      max_tokens: 300,
      temperature: 0.3,
      messages: [
        { role: 'system', content: MEMORY_REFLECTION_PROMPT },
        ...conversationMessages.slice(-6),
      ],
      tools: memoryWriteTools,
      tool_choice: 'auto',
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls?.length) return;

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const input = JSON.parse(call.function.arguments) as Record<string, unknown>;
      await executeTool(call.function.name, input, ctx);
      console.log(`[memory] reflection saved: ${call.function.name}`);
    }
  } catch (err) {
    console.error('[memory] reflection error:', (err as Error).message);
  }
}

export interface AITextResponse { type: 'text'; text: string }
export interface AIStickerResponse { type: 'sticker'; data: Buffer }
export interface AITextAndStickerResponse { type: 'text+sticker'; text: string; data: Buffer }
export interface AISilentResponse { type: 'silent' }
export type AIResult = AITextResponse | AIStickerResponse | AITextAndStickerResponse | AISilentResponse;

async function chatWithProvider(
  provider: AIProviderConfig,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  callParams: Record<string, unknown>,
): Promise<OpenAI.Chat.ChatCompletion> {
  const result = await provider.client.chat.completions.create({
    model: provider.model,
    ...callParams,
    messages,
  } as OpenAI.Chat.ChatCompletionCreateParams);
  if ('choices' in result) {
    return result as OpenAI.Chat.ChatCompletion;
  }
  // Should not happen with current params, but satisfies TypeScript
  throw new Error('Unexpected stream response');
}

export async function processWithAI(
  current: { text: string; userName: string; isGroup: boolean; platform: string; userId: string },
  history: ConversationMessage[],
): Promise<AIResult> {
  const ctx: ToolContext = {
    platform: current.platform,
    platformId: current.userId,
    displayName: current.userName,
  };

  // Pré-carrega memória do usuário e injeta no system prompt
  const memory = await getMemoryForContext(current.platform, current.userId, current.userName);

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const systemWithContext =
    SYSTEM_PROMPT +
    `\n[Agora: ${now} | Contexto: ${current.isGroup ? 'grupo' : 'privado'}]` +
    `\n\n## Memória de ${current.userName}\n${memory}`;

  const rawHistory: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(m => ({
    role: m.role,
    content: m.role === 'user' ? `${m.display_name ?? 'Usuário'}: ${m.content}` : m.content,
  } as OpenAI.Chat.ChatCompletionMessageParam));

  // Garante alternância user/assistant — remove mensagens consecutivas do mesmo role
  const alternated: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const msg of rawHistory) {
    if (alternated.length > 0 && alternated[alternated.length - 1].role === msg.role) {
      const prev = alternated[alternated.length - 1];
      prev.content = `${prev.content}\n${msg.content}`;
    } else {
      alternated.push({ ...msg });
    }
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemWithContext },
    ...alternated,
    { role: 'user', content: `${current.userName}: ${current.text}` },
  ];

  const callParams = {
    max_tokens: 2048,
    temperature: 0.9,
    frequency_penalty: 0.3,
    tools,
    tool_choice: 'auto' as const,
  };

  // Tenta provider ativo, se falhar tenta fallback
  const { primary, fallback } = getAllProviders();
  let currentProvider = primary;

  let response: OpenAI.Chat.ChatCompletion;
  let lastError: Error | null = null;

  try {
    response = await chatWithProvider(currentProvider, messages, callParams);
  } catch (err) {
    lastError = err as Error;
    console.error(`[ai] ${currentProvider.provider} error: ${lastError.message}`);

    if (fallback) {
      console.log(`[ai] trying fallback: ${fallback.provider}`);
      currentProvider = fallback;
      try {
        response = await chatWithProvider(currentProvider, messages, callParams);
      } catch (fallbackErr) {
        console.error(`[ai] fallback also failed: ${(fallbackErr as Error).message}`);
        return { type: 'silent' };
      }
    } else {
      return { type: 'silent' };
    }
  }

  let pendingSticker: Buffer | null = null;
  let didSearch = false;
  let pendingSearchUrls: string[] = [];

  // Tool calling loop
  while (response.choices[0]?.finish_reason === 'tool_calls') {
    const toolCalls = response.choices[0].message.tool_calls;
    if (!toolCalls?.length) break;

    messages.push({ role: 'assistant', content: response.choices[0].message.content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const input = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const result = await executeTool(call.function.name, input, ctx);

      if (call.function.name === 'web_search') didSearch = true;

      if (result.type === 'sticker') {
        pendingSticker = (result as StickerToolResult).data;
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'ok' });
      } else {
        messages.push({ role: 'tool', tool_call_id: call.id, content: result.text });
      }
    }

    try {
      response = await chatWithProvider(currentProvider, messages, callParams);
    } catch (err) {
      console.error(`[ai] tool call failed: ${(err as Error).message}`);
      break;
    }
  }

  let raw = response.choices[0]?.message?.content ?? '';

  // Detecta tool calls escritas como texto
  const textToolMatch = raw.match(/web_search\(["']([^"']+)["']\)/i);
  if (textToolMatch && !didSearch) {
    const query = textToolMatch[1];
    console.log(`[search] text-call detected, executing: "${query}"`);
    const { text: searchText, urls: searchUrls } = await webSearchWithUrls(query);
    console.log(`[search] result (${searchText.length} chars, ${searchUrls.length} urls)`);
    didSearch = true;
    pendingSearchUrls = searchUrls;

    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: `[Resultado da busca por "${query}"]:\n${searchText}\n\nAgora responda com base nessa informação. Não inclua os links — eles serão adicionados automaticamente.` });

    try {
      const finalResponse = await chatWithProvider(currentProvider, messages, callParams);
      raw = finalResponse.choices[0]?.message?.content ?? '';
    } catch (err) {
      console.error(`[ai] search re-query failed: ${(err as Error).message}`);
    }
  }

  const text = stripEmojis(trimAssistantSuffix(stripThinking(raw)));

  if (isRefusal(text)) {
    console.log(`[ai] refusal detected, silencing: "${text.substring(0, 60)}"`);
    return pendingSticker ? { type: 'sticker', data: pendingSticker } : { type: 'silent' };
  }

  // Reflexão de memória — fire-and-forget, não bloqueia a resposta
  reflectMemory(ctx, messages, currentProvider).catch(() => {});

  const urlSuffix = pendingSearchUrls.length ? '\n\n' + pendingSearchUrls.join('\n') : '';

  if (pendingSticker) {
    const stickerText = (text || 'toma') + urlSuffix;
    return { type: 'text+sticker', text: stickerText, data: pendingSticker };
  }

  if (!text && !urlSuffix) return { type: 'silent' };
  return { type: 'text', text: text + urlSuffix };
}
