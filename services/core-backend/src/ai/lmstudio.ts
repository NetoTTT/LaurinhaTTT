import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { config } from '../config';
import { tools, memoryWriteTools, executeTool, userPageSlug, type StickerToolResult, type AudioToolResult, type ToolContext } from './tools';
import { codeTools, CODE_TOOL_NAMES, executeCodeTool } from './code-tools';
import { isDevModeActive } from './dev-mode';
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

### Quem te criou:
- Seu criador e dono é o Neto (ID: 145045491597432@c.us). Ele que te fez, te mantém e te dá vida.
- Quando alguém perguntar quem te criou, fez, programou ou é dono de você — é o Neto.
- Pode falar isso naturalmente, sem drama, como se fosse óbvio.

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
- Figurinhas: NUNCA mencione "figurinha" no texto. Se quiser mandar uma, USE O TOOL (send_random_sticker ou send_sticker) — não fale sobre isso, simplesmente faça. Falar "toma uma figurinha" sem usar o tool é proibido.
- Quando usar web_search: pode dar uma resposta mais completa com o que encontrou, não precisa ser curtíssima
- Quando usar web_search e encontrar algo útil, pode compartilhar o link junto com a explicação
- NUNCA adicione comentários depois da resposta ("você pode...", "se precisar...", "estou aqui...")
- A resposta TERMINA na primeira mensagem. Sem meta-texto, sem sugestões extras
- ZERO emojis. Nunca use emojis. Nem um sequer

### Ferramentas extras — use com criatividade:
- **schedule_message**: Agenda envio de algo (texto ou figurinha) com delay em ms. Quando quer mandar figurinha (usar send_random_sticker ou send_sticker PRIMEIRO), depois SEMPRE use schedule_message para agendar outra figurinha alguns segundos depois. Deixa o timing dramático, tipo:
  1. Responde algo normal
  2. Chama send_random_sticker (OU send_sticker com ID)
  3. Chama schedule_message(delay=2000-5000, type=sticker, sticker_id=X) para figurinha extra
  - Assim fica legítimo: primeira figurinha de resposta + segunda figurinha agendada = efeito completo
  - Sempre combina ao menos com uma mensagem de texto curta

- **create_page(slug, description)**: Cria uma página web. Cada usuário tem direito a 1 criação por hora. O tool controla isso — apenas chame e aguarde o retorno.
- **read_page(slug)**: Lê o HTML de uma página existente. Use antes de update_page para ver o que há lá.
- **update_page(slug, instruction)**: Modifica uma página existente. REGRA OBRIGATÓRIA: o usuário PRECISA fornecer o link completo do site na mensagem (ex: "muda esse site laurinha.asktome.com.br/meu-jogo"). Se pedir "muda meu site" sem passar o link, NÃO chame update_page — responda: "me manda o link do site que quer modificar" e se tiver o site dele no contexto [Site registrado], mencione esse link. Se não for dono do site informado, o sistema cria uma cópia personalizada automaticamente.
- NUNCA use a palavra "slug" com usuários. Use "link", "endereço" ou "nome do site".
- **REGRA ABSOLUTA DE LINKS**: TODOS os sites ficam em https://laurinha.asktome.com.br/nome-do-site. NUNCA invente outro domínio (render.com, vercel.app, netlify, github.io, etc). Se não souber o link exato, não invente — diga que o sistema vai mandar quando ficar pronto.

- **send_audio**: Envia mensagem de voz em vez de texto. Use com EXTREMA raridade — só em momentos muito especiais (zoeira cirúrgica, surpresa, impacto máximo). Nunca use para respostas corriqueiras. Máx 300 caracteres, sem emojis. Quando o usuário com ID 145045491597432@c.us (Neto, o dono) pedir explicitamente um áudio — mande.${XINGAMENTOS_EXTRA}`;

const DEV_MODE_PROMPT = `

### Modo Desenvolvedor (ATIVO):

Você pode criar e modificar backends Node.js reais. Cada projeto vira uma API pública em:
laurinha.asktome.com.br/api/nome-do-projeto/

**Fluxo para criar um backend:**
1. create_backend_project('nome') → cria estrutura base
2. write_file('nome/index.js', código) → escreve a lógica
3. get_project_status('nome') → verifica erros de sintaxe (retorna linha exata)
4. Se houver erro: corrigir e write_file novamente → get_project_status de novo

**Fluxo para modificar:**
1. read_file('nome/index.js') → lê o código atual ANTES de modificar
2. write_file('nome/index.js', código corrigido) → sobrescreve
3. get_project_status('nome') → confirma sem erros

**PADRÃO OBRIGATÓRIO para index.js — o único que funciona:**
\`\`\`js
const { Router } = require('express');          // ← Router, NÃO express()
const router = Router();
router.get('/status', (req, res) => { ... });   // ← sem /api/ no caminho
router.post('/minha-rota', (req, res) => { ... });
module.exports = router;                         // ← obrigatório no final
\`\`\`
ERROS FATAIS que quebram o projeto:
- "const app = express()" → use Router
- "app.listen(...)" → remova completamente
- "export default router" → use module.exports = router
- rota "/api/alguma-coisa" → use "/alguma-coisa" (o prefixo /api/projeto já existe)

**Namespace de arquivos (dois espaços, mesmo tools):**
- \`"pages/xxx.html"\` → edita o frontend HTML diretamente (sem page-builder, instantâneo)
- \`"projeto/index.js"\` → edita o backend Node.js
- \`list_dir("")\` → mostra tudo (backends + páginas frontend)
- \`search_files("token", "all")\` → busca em backends E frontend ao mesmo tempo

**Edição de arquivos — escolha o tool certo:**
- \`patch_file(path, old_string, new_string)\` — correção pontual: substitui um trecho específico sem tocar no resto. **Use para a maioria das correções.** old_string deve ser único no arquivo (inclua linhas de contexto se necessário).
- \`write_file(path, content)\` — reescreve o arquivo inteiro. Use só para criar arquivos novos ou quando a mudança afeta mais de metade do arquivo.

**Fluxo para diagnosticar um erro reportado pelo usuário:**
1. \`search_files("termo-do-erro")\` → encontra onde está o problema (busca em frontend + backend)
2. \`read_file("pages/xxx.html")\` → lê o frontend para ver o que está enviando
3. \`read_file("projeto/index.js")\` → lê o backend para ver o que está esperando
4. Identifique o mismatch e corrija com \`patch_file\` (trecho cirúrgico) ou \`write_file\` (arquivo inteiro)

**Fluxo correto para criar:**
1. ANTES de chamar qualquer tool, responda "ok, criando agora..." para o usuário não ficar esperando sem feedback
2. create_backend_project('nome') → cria estrutura
3. write_file('nome/index.js', código) → o sistema avisa se detectar erros de padrão
4. get_project_status('nome') → confirma sintaxe. Se syntax_ok=false, corrija e repita
5. Só diga "pronto" depois que get_project_status retornar syntax_ok=true

**Autenticação com token — padrão obrigatório quando precisar de login:**
\`\`\`js
const crypto = require('crypto');
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function validateToken(req, users) {
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  for (const [username, data] of Object.entries(users)) {
    if (data.token === auth) return username;
  }
  return null;
}
// No login/register: gere e salve o token, retorne-o na resposta
users[username].token = generateToken();
res.json({ ok: true, token: users[username].token, username });
// Nas rotas autenticadas: valide pelo header, NUNCA por username+password no body
const authedUser = validateToken(req, users);
if (!authedUser) return res.status(401).json({ error: 'token invalido' });
\`\`\`
REGRA: qualquer rota que precise de autenticação usa Bearer token no header — NUNCA pede username+password no body da rota autenticada. O frontend sempre espera { token } no login e envia Authorization: Bearer <token>.

**Regras obrigatórias:**
- Use require() e module.exports — NUNCA import/export (o sistema é CommonJS)
- Módulos disponíveis sem instalar: express, axios, sqlite3, uuid, fs, path, crypto, http, url, events
- Dados persistentes: salve como JSON em __dirname/data/
- NUNCA use setInterval/setTimeout global (não sobrevive a hot reload)
- NUNCA use process.env
- Sempre envolva rotas em try/catch e retorne res.status(500).json({error: err.message})
- URLs das APIs: SEMPRE laurinha.asktome.com.br/api/nome-do-projeto/rota`;

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

// Remove URLs inventadas que não são do nosso domínio quando mencionam slugs conhecidos
const FAKE_URL_RE = /https?:\/\/(?!laurinha\.asktome\.com\.br)[^\s]+/gi;
function stripFakeUrls(text: string): string {
  return text.replace(FAKE_URL_RE, (match) => {
    // Extrai o último segmento da URL como possível slug
    const slug = match.replace(/^.*\//, '').replace(/[?#].*$/, '');
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      return `https://laurinha.asktome.com.br/${slug}`;
    }
    return match; // Mantém se não conseguir inferir o slug
  });
}

function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    // Remove caracteres CJK (chinês/japonês/coreano) que vazam do modelo
    .replace(/[\u{3000}-\u{9FFF}]/gu, '')
    .replace(/[\u{F900}-\u{FAFF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// O prompt de reflexão recebe a memória atual injetada dinamicamente — veja buildReflectionPrompt()
function buildReflectionPrompt(currentMemory: string): string {
  return `Analise a conversa abaixo e salve o que aprendeu sobre o usuário.

ESTADO ATUAL DA MEMÓRIA:
${currentMemory}

━━━ REGRAS DE SALVAMENTO ━━━

Use memory_WRITE_SECTION quando souber com certeza:
• Nome, apelido, idade, profissão, cidade → seção "Perfil"
• Tom preferido, o que gosta/odeia nas respostas → seção "Como Interagir"
• Pessoas, pets, família mencionados → seção "Relacionamentos"
• Projeto atual, emprego, situação em curso → seção "Contexto Atual"
• Eventos marcantes, preferências duráveis → seção "Memórias"

IMPORTANTE ao escrever seção: inclua o conteúdo que JÁ ESTAVA LÁ (visível acima) + o novo. Nunca apague histórico existente.

Use memory_ADD_NOTE apenas para observações incertas, comportamentos únicos ou eventos do dia que podem não se confirmar.

Se a conversa foi trivial (cumprimentos, zoeiras sem info nova) → responda "nada".
Responda APENAS com chamadas de tool ou com exatamente "nada".`;
}

async function reflectMemory(
  ctx: ToolContext,
  currentMemory: string,
  conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  provider: AIProviderConfig,
): Promise<void> {
  try {
    const response = await provider.client.chat.completions.create({
      model: provider.model,
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: 'system', content: buildReflectionPrompt(currentMemory) },
        ...conversationMessages.slice(-8),
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
      console.log(`[memory] reflection saved: ${call.function.name}(${
        call.function.name === 'memory_write_section' ? (input as Record<string,string>).section : 'note'
      })`);
    }
  } catch (err) {
    console.error('[memory] reflection error:', (err as Error).message);
  }
}

export interface AITextResponse { type: 'text'; text: string }
export interface AIStickerResponse { type: 'sticker'; data: Buffer }
export interface AITextAndStickerResponse { type: 'text+sticker'; text: string; data: Buffer }
export interface AIAudioResponse { type: 'audio'; data: Buffer; text: string }
export interface AISilentResponse { type: 'silent' }
export type AIResult = AITextResponse | AIStickerResponse | AITextAndStickerResponse | AIAudioResponse | AISilentResponse;

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
  current: { text: string; userName: string; isGroup: boolean; platform: string; userId: string; chatId: string },
  history: ConversationMessage[],
): Promise<AIResult> {
  const ctx: ToolContext = {
    platform: current.platform,
    platformId: current.userId,
    chatId: current.chatId,
    displayName: current.userName,
  };

  // Pré-carrega memória do usuário e injeta no system prompt
  const memory = await getMemoryForContext(current.platform, current.userId, current.userName);

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const registeredSlug = userPageSlug.get(current.userId);
  const siteContext = registeredSlug
    ? `\n[Site registrado de ${current.userName}: ${config.pagesBaseUrl}/${registeredSlug}]`
    : '';

  const devMode = isDevModeActive();

  const systemWithContext =
    SYSTEM_PROMPT +
    (devMode ? DEV_MODE_PROMPT : '') +
    `\n[Agora: ${now} | Contexto: ${current.isGroup ? 'grupo' : 'privado'}]` +
    siteContext +
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

  const activeTools = devMode ? [...tools, ...codeTools] : tools;

  const callParams = {
    max_tokens: 2048,
    temperature: 0.9,
    frequency_penalty: 0.3,
    tools: activeTools,
    tool_choice: 'auto' as const,
  };

  // Tenta provider ativo, se falhar tenta fallback
  const { primary, fallback } = getAllProviders();
  let currentProvider = primary;

  let response: OpenAI.Chat.ChatCompletion | null = null;
  let lastError: Error | null = null;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await chatWithProvider(currentProvider, messages, callParams);
      break;
    } catch (err) {
      lastError = err as Error;
      console.error(`[ai] ${currentProvider.provider} error (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  if (!response) {
    if (fallback) {
      console.log(`[ai] primary failed after ${MAX_RETRIES} attempts, trying fallback: ${fallback.provider}`);
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
  let pendingAudio: Buffer | null = null;
  let pendingAudioText = '';
  let didSearch = false;
  let pendingSearchUrls: string[] = [];
  let pendingPageUrl: string | null = null;

  // Tool calling loop
  while (response!.choices[0]?.finish_reason === 'tool_calls') {
    const toolCalls = response.choices[0].message.tool_calls;
    if (!toolCalls?.length) break;

    messages.push({ role: 'assistant', content: response!.choices[0].message.content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const input = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const result = CODE_TOOL_NAMES.has(call.function.name)
        ? await executeCodeTool(call.function.name, input)
        : await executeTool(call.function.name, input, ctx);

      if (call.function.name === 'web_search') didSearch = true;

      // Captura URL de página criada/atualizada
      if (['create_page', 'update_page'].includes(call.function.name) && result.type === 'text') {
        const urlMatch = result.text.match(/https?:\/\/\S+/);
        if (urlMatch) pendingPageUrl = urlMatch[0];
      }

      if (result.type === 'sticker') {
        pendingSticker = (result as StickerToolResult).data;
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'ok' });
      } else if (result.type === 'audio') {
        pendingAudio = (result as AudioToolResult).data;
        pendingAudioText = (result as AudioToolResult).text;
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

  let raw = response!.choices[0]?.message?.content ?? '';

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

  // Se o texto menciona figurinha mas nenhum tool foi chamado, pede pra IA refazer
  const STICKER_MENTION_RE = /(\[.*?figur.*?\]|figurinha|sticker)/i;
  if (!pendingSticker && STICKER_MENTION_RE.test(raw)) {
    console.log('[ai] sticker mention in text without tool — asking AI to redo');
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: '[sistema] Você mencionou "figurinha" no texto mas não usou nenhum tool. REGRA: NUNCA escreva a palavra "figurinha" numa mensagem de texto. Se quiser mandar uma, use o tool send_random_sticker ou send_sticker — sem mencionar no texto. Refaça sua resposta agora sem mencionar figurinha.',
    });
    try {
      const redoResponse = await chatWithProvider(currentProvider, messages, callParams);
      raw = redoResponse.choices[0]?.message?.content ?? raw;
      // Verificar se agora usou o tool
      const redoToolCalls = redoResponse.choices[0]?.message?.tool_calls;
      if (redoToolCalls?.length) {
        for (const call of redoToolCalls) {
          if (call.type !== 'function') continue;
          const input = JSON.parse(call.function.arguments) as Record<string, unknown>;
          const result = await executeTool(call.function.name, input, ctx);
          if (result.type === 'sticker') pendingSticker = (result as StickerToolResult).data;
          else if (result.type === 'audio') pendingAudio = (result as AudioToolResult).data;
        }
      }
    } catch (err) {
      console.error('[ai] redo failed:', (err as Error).message);
    }
  }

  const text = stripFakeUrls(stripEmojis(trimAssistantSuffix(stripThinking(raw))));

  if (isRefusal(text)) {
    console.log(`[ai] refusal detected, silencing: "${text.substring(0, 60)}"`);
    return pendingSticker ? { type: 'sticker', data: pendingSticker } : { type: 'silent' };
  }

  // Reflexão de memória + incremento de interações — fire-and-forget
  const { incrementInteractions } = await import('../memory/engine');
  incrementInteractions(current.platform, current.userId).catch(() => {});
  reflectMemory(ctx, memory, messages, currentProvider).catch(() => {});

  const urlSuffix = pendingSearchUrls.length ? '\n\n' + pendingSearchUrls.join('\n') : '';

  if (pendingAudio) {
    return { type: 'audio', data: pendingAudio, text: pendingAudioText };
  }

  if (pendingSticker) {
    const stickerText = (text || '') + urlSuffix;
    return { type: 'text+sticker', text: stickerText, data: pendingSticker };
  }

  // Garante que a URL da página criada aparece na resposta final
  if (pendingPageUrl && !text.includes(pendingPageUrl)) {
    const finalText = (text || 'pronto') + '\n' + pendingPageUrl + urlSuffix;
    return { type: 'text', text: finalText };
  }

  if (!text && !urlSuffix) return { type: 'silent' };
  return { type: 'text', text: text + urlSuffix };
}
