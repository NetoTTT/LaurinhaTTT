import { config } from '../config';

export interface SearchOutput {
  text: string;   // conteúdo para o modelo processar
  urls: string[]; // links para anexar na resposta
}

export async function webSearchWithUrls(query: string): Promise<SearchOutput> {
  if (config.braveSearchKey) {
    const result = await braveSearchWithUrls(query);
    if (result) return result;
  }
  return { text: await ddgSearch(query), urls: [] };
}

export async function webSearch(query: string): Promise<string> {
  if (config.braveSearchKey) {
    const result = await braveSearch(query);
    if (result) return result;
  }
  return await ddgSearch(query);
}

async function braveSearchWithUrls(query: string): Promise<SearchOutput | null> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': config.braveSearchKey, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const results: any[] = data?.web?.results ?? [];
    if (!results.length) return null;

    const urls = results.map((r: any) => r.url).filter(Boolean).slice(0, 3);
    const text = results.slice(0, 4).map((r: any) => {
      const desc = (r.description ?? '').replace(/<[^>]+>/g, '').trim();
      const extras = ((r.extra_snippets ?? []) as string[]).map((s: string) => s.replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 2).join(' ');
      const full = [desc, extras].filter(Boolean).join(' ');
      return full ? `${r.title}: ${full}` : r.title;
    }).filter(Boolean).join('\n\n');

    return { text, urls };
  } catch {
    return null;
  }
}

async function braveSearch(query: string): Promise<string | null> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Subscription-Token': config.braveSearchKey,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      console.warn(`[search] brave HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const results: any[] = data?.web?.results ?? [];
    console.log(`[search] brave returned ${results.length} results`);
    if (!results.length) return null;

    return results.slice(0, 4)
      .map((r: any) => {
        const desc = (r.description ?? '').replace(/<[^>]+>/g, '').trim();
        const extras = ((r.extra_snippets ?? []) as string[])
          .map((s: string) => s.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(' ');
        const full = [desc, extras].filter(Boolean).join(' ');
        const url = r.url ? `\nLink: ${r.url}` : '';
        return full ? `${r.title}: ${full}${url}` : `${r.title}${url}`;
      })
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    console.warn('[search] brave error:', (err as Error).message);
    return null;
  }
}

async function ddgSearch(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    if (!res.ok) return 'Não consegui buscar agora.';

    const html = await res.text();

    // DDG pode mudar classes — tenta padrões alternativos
    const patterns = [
      /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
      /<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g,
      /class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\//g,
    ];

    for (const re of patterns) {
      const matches = [...html.matchAll(re)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      if (matches.length) return matches.slice(0, 3).join('\n\n');
    }

    return 'Não encontrei resultados.';
  } catch {
    return 'Erro ao buscar.';
  }
}
