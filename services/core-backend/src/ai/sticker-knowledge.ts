import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config';

const KNOWLEDGE_FILE = join(dirname(config.memoryPath), 'sticker-knowledge.json');

export interface StickerKnowledge {
  description: string;
  added_by: string;
  added_at: string;
}

let cache: Record<string, StickerKnowledge> = {};

function load(): void {
  try {
    if (existsSync(KNOWLEDGE_FILE)) {
      cache = JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf-8')) as Record<string, StickerKnowledge>;
    }
  } catch { /* ignora */ }
}

function save(): void {
  try {
    writeFileSync(KNOWLEDGE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch { /* ignora */ }
}

load();

export function teachSticker(id: number, description: string, addedBy: string): void {
  cache[String(id)] = { description, added_by: addedBy, added_at: new Date().toISOString() };
  save();
  console.log(`[stickers] ensinada: #${id} → "${description}" (por ${addedBy})`);
}

export function forgetSticker(id: number): boolean {
  if (!cache[String(id)]) return false;
  delete cache[String(id)];
  save();
  return true;
}

export function getAll(): Record<string, StickerKnowledge> {
  return cache;
}

export function formatForPrompt(): string {
  const entries = Object.entries(cache);
  if (!entries.length) return '';
  const lines = entries.map(([id, k]) => `- #${id}: "${k.description}"`).join('\n');
  return `\n## Figurinhas que já conheço (use send_sticker com o ID):\n${lines}\nSe nenhuma se encaixar no momento → use send_random_sticker`;
}
