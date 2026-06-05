import { createHash } from 'crypto';
import { pool } from './database';

export interface StickerEntry {
  id: number;
  media_file_id: number;
  hash: string;
  size: number;
  mimetype: string;
  saved_at: Date;
}

export async function saveSticker(userId: number, data: Buffer, mimetype: string): Promise<number> {
  const hash = createHash('sha256').update(data).digest('hex');

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO media_files (hash, data, mimetype, size)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (hash) DO UPDATE SET hash = EXCLUDED.hash
     RETURNING id`,
    [hash, data, mimetype, data.length],
  );
  const mediaFileId = rows[0].id;

  await pool.query(
    `INSERT INTO user_stickers (user_id, media_file_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, media_file_id) DO NOTHING`,
    [userId, mediaFileId],
  );

  return mediaFileId;
}

export async function getUserStickers(userId: number): Promise<StickerEntry[]> {
  const { rows } = await pool.query<StickerEntry>(
    `SELECT us.id, us.media_file_id, mf.hash, mf.size, mf.mimetype, us.created_at AS saved_at
     FROM user_stickers us
     JOIN media_files mf ON mf.id = us.media_file_id
     WHERE us.user_id = $1
     ORDER BY us.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getStickerData(mediaFileId: number): Promise<Buffer | null> {
  const { rows } = await pool.query<{ data: Buffer }>(
    'SELECT data FROM media_files WHERE id = $1',
    [mediaFileId],
  );
  return rows[0]?.data ?? null;
}

export async function getRandomStickerData(): Promise<Buffer | null> {
  const { rows } = await pool.query<{ data: Buffer }>(
    'SELECT data FROM media_files ORDER BY RANDOM() LIMIT 1',
  );
  return rows[0]?.data ?? null;
}

export async function getRandomStickerWithId(): Promise<{ id: number; data: Buffer } | null> {
  const { rows } = await pool.query<{ id: number; data: Buffer }>(
    'SELECT id, data FROM media_files ORDER BY RANDOM() LIMIT 1',
  );
  return rows[0] ?? null;
}

export async function getStickerIdByData(data: Buffer): Promise<number | null> {
  const hash = createHash('sha256').update(data).digest('hex');
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM media_files WHERE hash = $1 LIMIT 1',
    [hash],
  );
  return rows[0]?.id ?? null;
}
