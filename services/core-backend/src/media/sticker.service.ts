import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const execFileAsync = promisify(execFile);
const STICKER_SIZE = 512;

export async function imageToSticker(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .ensureAlpha()
    .resize(STICKER_SIZE, STICKER_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80, alphaQuality: 100 })
    .toBuffer();
}

export async function videoToSticker(input: Buffer, mimetype: string): Promise<Buffer> {
  const id = randomBytes(8).toString('hex');
  const ext = mimetype.includes('gif') ? 'gif' : 'mp4';
  const inputPath = join(tmpdir(), `sticker-in-${id}.${ext}`);
  const outputPath = join(tmpdir(), `sticker-out-${id}.webp`);

  try {
    await writeFile(inputPath, input);
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vf', `fps=15,scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=decrease,pad=${STICKER_SIZE}:${STICKER_SIZE}:(ow-iw)/2:(oh-ih)/2:color=00000000`,
      '-loop', '0',
      '-t', '6',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-compression_level', '6',
      '-q:v', '50',
      '-an',
      '-y',
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export function base64ToBuffer(base64: string): Buffer {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  return Buffer.from(data, 'base64');
}

export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}
