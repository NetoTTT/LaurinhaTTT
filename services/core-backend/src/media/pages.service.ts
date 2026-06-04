import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

function safeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);
}

export function writePage(slug: string, html: string): string {
  mkdirSync(config.pagesDir, { recursive: true });
  const safe = safeSlug(slug);
  writeFileSync(join(config.pagesDir, `${safe}.html`), html, 'utf-8');
  return `${config.pagesBaseUrl}/${safe}`;
}

export function readPage(slug: string): string | null {
  const safe = safeSlug(slug);
  const filepath = join(config.pagesDir, `${safe}.html`);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, 'utf-8');
}
