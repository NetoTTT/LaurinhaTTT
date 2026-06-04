import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { config } from '../config';

export async function textToSpeech(text: string): Promise<Buffer> {
  if (text.length > 300) {
    throw new Error('Texto muito longo para TTS (máx 300 chars)');
  }

  const response = await fetch('https://p.cluster.resemble.ai/synthesize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resembleApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      voice_uuid: config.resembleVoiceUuid,
      data: text,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Resemble API error: ${(err as any).message ?? response.status}`);
  }

  const json = await response.json() as { success: boolean; audio_content?: string; message?: string };
  if (!json.success || !json.audio_content) {
    throw new Error(`Resemble: ${json.message ?? 'sem áudio'}`);
  }

  const wavBuffer = Buffer.from(json.audio_content, 'base64');
  return wavToOgg(wavBuffer);
}

function wavToOgg(wavBuffer: Buffer): Buffer {
  const id = Date.now();
  const wavPath = join(tmpdir(), `tts_${id}.wav`);
  const oggPath = join(tmpdir(), `tts_${id}.ogg`);

  try {
    writeFileSync(wavPath, wavBuffer);
    execSync(`ffmpeg -y -i "${wavPath}" -c:a libopus -b:a 32k -ar 48000 "${oggPath}"`, { stdio: 'pipe' });
    const oggBuffer = readFileSync(oggPath);
    return oggBuffer;
  } finally {
    try { unlinkSync(wavPath); } catch {}
    try { unlinkSync(oggPath); } catch {}
  }
}
