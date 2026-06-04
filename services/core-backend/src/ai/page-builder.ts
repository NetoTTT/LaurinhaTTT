import OpenAI from 'openai';
import { getAllProviders } from './providers';
import { webSearchWithUrls } from './search';

const PAGE_SYSTEM_PROMPT = `Você é um desenvolvedor web expert. Sua única função é gerar HTML completo e funcional.

Regras:
- Retorne APENAS o HTML — nada antes, nada depois, sem explicações, sem markdown, sem blocos de código
- O HTML deve começar com <!DOCTYPE html> e ser completo
- CSS e JavaScript 100% inline (no <style> e <script> dentro do HTML)
- Pode usar CDNs públicos (tailwind, font awesome, etc)
- Design moderno, responsivo e bonito
- Português brasileiro
- Funcional: tudo deve realmente funcionar
- Se receber dados de pesquisa web, use-os para preencher o conteúdo com informações reais e precisas`;

// Decide se a descrição precisa de dados da web
function needsWebSearch(description: string): boolean {
  const keywords = [
    'personagem', 'anime', 'série', 'filme', 'jogo', 'time', 'jogador',
    'ranking', 'lista', 'top', 'melhor', 'pior', 'historia', 'historia',
    'real', 'verdadeiro', 'atual', 'informacao', 'dados', 'fatos',
    'one piece', 'naruto', 'dragon ball', 'marvel', 'dc',
  ];
  const lower = description.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

// Gera queries de busca relevantes a partir da descrição
function buildSearchQueries(description: string): string[] {
  const lower = description.toLowerCase();
  const queries: string[] = [];

  // Extrai tópico principal (primeiras ~60 chars)
  const topic = description.slice(0, 120).replace(/crie?|faça?|fazer?|página|site|web|html/gi, '').trim();
  queries.push(topic);

  // Query adicional em inglês pra resultados mais ricos
  if (lower.includes('one piece')) queries.push('one piece all characters list by importance');
  else if (lower.includes('naruto')) queries.push('naruto characters list');
  else if (lower.includes('dragon ball')) queries.push('dragon ball characters list');

  return queries.slice(0, 2);
}

export async function buildPageHTML(description: string, existingHtml?: string): Promise<string> {
  const { primary, fallback } = getAllProviders();

  let webContext = '';

  // Busca dados na web se o conteúdo precisar de informações reais
  if (!existingHtml && needsWebSearch(description)) {
    const queries = buildSearchQueries(description);
    console.log(`[page-builder] buscando na web: ${queries.join(' | ')}`);

    const results = await Promise.allSettled(queries.map(q => webSearchWithUrls(q)));
    const texts = results
      .filter((r): r is PromiseFulfilledResult<{ text: string; urls: string[] }> => r.status === 'fulfilled')
      .map(r => r.value.text)
      .join('\n\n');

    if (texts) {
      webContext = `\n\n## Dados da web para usar no conteúdo:\n${texts.slice(0, 8000)}`;
      console.log(`[page-builder] contexto web: ${texts.length} chars`);
    }
  }

  const userContent = existingHtml
    ? `Corrija/atualize esta página conforme a instrução: "${description}"\n\nHTML atual:\n${existingHtml}`
    : `Crie uma página web completa: ${description}${webContext}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: PAGE_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const params = {
    model: primary.model,
    max_tokens: 60000,
    temperature: 0.3,
    messages,
  } as OpenAI.Chat.ChatCompletionCreateParams;

  let raw: string | null = null;

  for (const provider of [primary, fallback].filter(Boolean)) {
    try {
      const response = await provider!.client.chat.completions.create(params, { timeout: 300_000 }) as OpenAI.Chat.ChatCompletion;
      raw = response.choices[0]?.message?.content ?? null;
      if (raw) break;
    } catch (err) {
      console.error(`[page-builder] ${provider!.provider} failed:`, (err as Error).message);
    }
  }

  if (!raw) throw new Error('Nenhum provider conseguiu gerar o HTML');

  // Extrai HTML se o modelo colocou dentro de um bloco de código
  const codeBlock = raw.match(/```(?:html)?\n?([\s\S]+?)```/i);
  if (codeBlock) return codeBlock[1].trim();

  // Garante que começa com <!DOCTYPE
  const docStart = raw.indexOf('<!DOCTYPE');
  if (docStart > 0) return raw.slice(docStart).trim();

  return raw.trim();
}
