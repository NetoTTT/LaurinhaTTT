import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

const MAX_FILE_CHARS = 3500;
const MAX_PENDING_NOTES = 8;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface MemoryMeta {
  userId: string;
  platform: string;
  interactions: number;
  compactCount: number;
  language: string;
  firstSeen: string;
  lastActive: string;
  preferredName: string; // como este usuário chama a Laura
}

export interface Memory {
  meta: MemoryMeta;
  sections: Map<string, string>;
  raw: string;
}

// Ordem canônica das seções — preservada em toda serialização
const SECTION_ORDER = [
  'Perfil',
  'Como Interagir',
  'Relacionamentos',
  'Contexto Atual',
  'Memórias',
  'Notas Pendentes',
];

// ─── Paths ───────────────────────────────────────────────────────────────────

function safeId(platformId: string): string {
  return platformId.replace(/[^a-zA-Z0-9@._-]/g, '_');
}

function filePath(platform: string, platformId: string): string {
  return join(config.memoryPath, `${platform}_${safeId(platformId)}.md`);
}

export async function ensureMemoryDir(): Promise<void> {
  await mkdir(config.memoryPath, { recursive: true });
}

// ─── Parse / Serialize ───────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?/;

function parseMeta(raw: string): { meta: MemoryMeta; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    const now = new Date().toISOString();
    return {
      meta: { userId: '', platform: '', interactions: 0, compactCount: 0, language: 'pt-BR', firstSeen: now, lastActive: now, preferredName: 'Laura' },
      body: raw,
    };
  }
  const fm = match[1];
  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  const now = new Date().toISOString();
  return {
    meta: {
      userId: get('user_id'),
      platform: get('platform'),
      interactions: parseInt(get('interactions') || '0', 10),
      compactCount: parseInt(get('compact_count') || '0', 10),
      language: get('language') || 'pt-BR',
      firstSeen: get('first_seen') || now,
      lastActive: get('last_active') || now,
      preferredName: get('preferred_name') || 'Laura',
    },
    body: raw.slice(match[0].length),
  };
}

function buildFrontmatter(meta: MemoryMeta): string {
  return [
    '---',
    `schema_version: 1`,
    `user_id: ${meta.userId}`,
    `platform: ${meta.platform}`,
    `preferred_name: ${meta.preferredName}`,
    `first_seen: ${meta.firstSeen}`,
    `last_active: ${meta.lastActive}`,
    `interactions: ${meta.interactions}`,
    `compact_count: ${meta.compactCount}`,
    `language: ${meta.language}`,
    '---',
    '',
  ].join('\n');
}

function parseSections(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = body.split(/^(## .+)$/m);
  for (let i = 1; i < parts.length - 1; i += 2) {
    const name = parts[i].slice(3).trim();
    const content = (parts[i + 1] ?? '').trim();
    map.set(name, content);
  }
  return map;
}

function serializeSections(sections: Map<string, string>): string {
  // Serializa na ordem canônica; seções extras (se houver) vão ao final
  const ordered: string[] = [];
  const extra: string[] = [];

  for (const name of SECTION_ORDER) {
    const content = sections.get(name);
    if (content !== undefined) {
      ordered.push(`## ${name}\n${content || '_Vazio._'}`);
    }
  }

  for (const [name, content] of sections) {
    if (!SECTION_ORDER.includes(name)) {
      extra.push(`## ${name}\n${content || '_Vazio._'}`);
    }
  }

  return [...ordered, ...extra].join('\n\n') + '\n';
}

function buildRaw(meta: MemoryMeta, sections: Map<string, string>): string {
  return buildFrontmatter(meta) + '\n' + serializeSections(sections);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function readMemory(platform: string, platformId: string): Promise<Memory | null> {
  const path = filePath(platform, platformId);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  const { meta, body } = parseMeta(raw);
  return { meta, sections: parseSections(body), raw };
}

async function writeRaw(platform: string, platformId: string, raw: string): Promise<void> {
  await writeFile(filePath(platform, platformId), raw, 'utf-8');
}

export async function getOrCreateMemory(
  platform: string,
  platformId: string,
  displayName: string,
  language = 'pt-BR',
): Promise<Memory> {
  const existing = await readMemory(platform, platformId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const meta: MemoryMeta = {
    userId: platformId,
    platform,
    interactions: 0,
    compactCount: 0,
    language,
    firstSeen: now,
    lastActive: now,
    preferredName: 'Laura',
  };

  const sections = new Map<string, string>([
    ['Perfil', '_Sem informações ainda._'],
    ['Como Interagir', '_Sem observações ainda._'],
    ['Relacionamentos', '_Nenhum registrado._'],
    ['Contexto Atual', '_Nada registrado._'],
    ['Memórias', '_Nenhuma ainda._'],
    ['Notas Pendentes', ''],
  ]);

  const raw = buildRaw(meta, sections);
  await ensureMemoryDir();
  await writeRaw(platform, platformId, raw);

  console.log(`[memory] created for ${displayName} (${platformId})`);
  return { meta, sections, raw };
}

export async function getSection(
  platform: string,
  platformId: string,
  sectionName: string,
): Promise<string | null> {
  const memory = await readMemory(platform, platformId);
  return memory?.sections.get(sectionName) ?? null;
}

export async function writeSection(
  platform: string,
  platformId: string,
  sectionName: string,
  content: string,
): Promise<void> {
  const memory = await getOrCreateMemory(platform, platformId, platformId);
  memory.sections.set(sectionName, content);
  const updated: MemoryMeta = { ...memory.meta, lastActive: new Date().toISOString() };
  await writeRaw(platform, platformId, buildRaw(updated, memory.sections));
}

export async function appendNote(
  platform: string,
  platformId: string,
  note: string,
): Promise<{ needsCompaction: boolean }> {
  const memory = await getOrCreateMemory(platform, platformId, platformId);
  const existing = memory.sections.get('Notas Pendentes') ?? '';
  const lines = existing.split('\n').filter(Boolean);

  const ts = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  lines.push(`- [${ts}] ${note}`);
  memory.sections.set('Notas Pendentes', lines.join('\n'));

  const updated: MemoryMeta = { ...memory.meta, lastActive: new Date().toISOString() };
  const newRaw = buildRaw(updated, memory.sections);
  await writeRaw(platform, platformId, newRaw);

  return { needsCompaction: newRaw.length > MAX_FILE_CHARS || lines.length >= MAX_PENDING_NOTES };
}

// Atualiza o nome preferido da Laura para este usuário (lido do frontmatter pelo backend)
export async function setPreferredName(platform: string, platformId: string, name: string): Promise<void> {
  const memory = await readMemory(platform, platformId);
  if (!memory) return;
  const updated: MemoryMeta = { ...memory.meta, preferredName: name, lastActive: new Date().toISOString() };
  await writeRaw(platform, platformId, buildRaw(updated, memory.sections));
}

export async function incrementInteractions(platform: string, platformId: string): Promise<void> {
  const memory = await readMemory(platform, platformId);
  if (!memory) return;
  const updated: MemoryMeta = {
    ...memory.meta,
    interactions: memory.meta.interactions + 1,
    lastActive: new Date().toISOString(),
  };
  await writeRaw(platform, platformId, buildRaw(updated, memory.sections));
}

// Compactação: Gemini reescreveu o corpo, engine salva com meta atualizado
export async function compactMemory(
  platform: string,
  platformId: string,
  newBody: string,
): Promise<void> {
  const memory = await readMemory(platform, platformId);
  const now = new Date().toISOString();
  const meta: MemoryMeta = memory
    ? { ...memory.meta, lastActive: now, compactCount: memory.meta.compactCount + 1 }
    : { userId: platformId, platform, interactions: 0, compactCount: 1, language: 'pt-BR', firstSeen: now, lastActive: now, preferredName: 'Laura' };

  const sections = parseSections(newBody);
  sections.set('Notas Pendentes', ''); // sempre zerada após compactação

  // Garante que todas as seções canônicas existem
  for (const name of SECTION_ORDER) {
    if (!sections.has(name)) sections.set(name, '_Vazio._');
  }

  await writeRaw(platform, platformId, buildRaw(meta, sections));
  console.log(`[memory] compacted #${meta.compactCount} for ${platformId}`);
}

export async function needsCompaction(platform: string, platformId: string): Promise<boolean> {
  const memory = await readMemory(platform, platformId);
  if (!memory) return false;
  const notes = memory.sections.get('Notas Pendentes') ?? '';
  const noteCount = notes.split('\n').filter(Boolean).length;
  return memory.raw.length > MAX_FILE_CHARS || noteCount >= MAX_PENDING_NOTES;
}

export async function getMemoryForContext(
  platform: string,
  platformId: string,
  displayName: string,
): Promise<string> {
  const memory = await getOrCreateMemory(platform, platformId, displayName);
  return memory.raw;
}
