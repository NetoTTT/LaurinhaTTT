import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

const HISTORY_DIR = join(config.pagesDir, '.history');

function ensureDir(): void {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

function historyFile(slug: string): string {
  return join(HISTORY_DIR, `${slug}.md`);
}

export interface PageActionLog {
  slug: string;
  action: 'criação' | 'edição' | 'clone' | 'fork' | 'backend';
  by: string;
  description: string;
  sourceUrl?: string;
  hasBackend?: boolean;
}

export function logPageAction(log: PageActionLog): void {
  try {
    ensureDir();
    const ts = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const lines = [
      `## ${log.action} — ${ts}`,
      `- Pedido por: ${log.by}`,
      `- O que foi pedido: ${log.description}`,
    ];
    if (log.sourceUrl) lines.push(`- Clonado de: ${log.sourceUrl}`);
    if (log.hasBackend) lines.push(`- Tem backend/API associado`);
    lines.push('');

    appendFileSync(historyFile(log.slug), lines.join('\n') + '\n', 'utf-8');
    console.log(`[page-history] registrado: ${log.action} de "${log.slug}" por ${log.by}`);
  } catch (err) {
    console.error('[page-history] erro ao registrar:', (err as Error).message);
  }
}

export function getPageHistory(slug: string): string | null {
  const file = historyFile(slug);
  if (!existsSync(file)) return null;
  try {
    const content = readFileSync(file, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}
