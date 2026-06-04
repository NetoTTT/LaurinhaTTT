import { readMemory, compactMemory, needsCompaction } from './engine';
import { compactMemoryWithOpenCodeGo } from '../ai/compact';

// Chamado pelo backend (handler, scheduler) — nunca pelo modelo
export async function compactViaBackend(platform: string, platformId: string): Promise<boolean> {
  if (!(await needsCompaction(platform, platformId))) return false;

  const memory = await readMemory(platform, platformId);
  if (!memory) return false;

  const noteCount = (memory.sections.get('Notas Pendentes') ?? '').split('\n').filter(Boolean).length;
  console.log(`[memory] compacting ${platformId} (${noteCount} notas pendentes)...`);
  try {
    const compacted = await compactMemoryWithOpenCodeGo(memory.raw);
    if (!compacted || compacted.length < 50) {
      console.error(`[memory] compaction returned empty/short result for ${platformId}, skipping`);
      return false;
    }
    await compactMemory(platform, platformId, compacted);
    console.log(`[memory] compaction done for ${platformId}`);
    return true;
  } catch (err) {
    console.error(`[memory] compaction failed for ${platformId}:`, (err as Error).message);
    return false;
  }
}
