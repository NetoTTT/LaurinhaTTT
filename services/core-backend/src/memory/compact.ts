import { readMemory, compactMemory, needsCompaction } from './engine';
import { compactMemoryWithGemini } from '../ai/gemini';

// Chamado pelo backend (handler, scheduler) — nunca pelo modelo
export async function compactViaBackend(platform: string, platformId: string): Promise<boolean> {
  if (!(await needsCompaction(platform, platformId))) return false;

  const memory = await readMemory(platform, platformId);
  if (!memory) return false;

  console.log(`[memory] triggering Gemini compaction for ${platformId}...`);
  const compacted = await compactMemoryWithGemini(memory.raw);
  await compactMemory(platform, platformId, compacted);
  return true;
}
