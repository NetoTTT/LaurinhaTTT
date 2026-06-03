import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function initDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commands (
      id         SERIAL PRIMARY KEY,
      trigger    TEXT UNIQUE NOT NULL,
      response   TEXT NOT NULL,
      enabled    BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      platform     TEXT NOT NULL,
      platform_id  TEXT NOT NULL,
      display_name TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(platform, platform_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_files (
      id         SERIAL PRIMARY KEY,
      hash       TEXT UNIQUE NOT NULL,
      data       BYTEA NOT NULL,
      mimetype   TEXT NOT NULL DEFAULT 'image/webp',
      size       INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_stickers (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      media_file_id INTEGER NOT NULL REFERENCES media_files(id),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, media_file_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id           BIGSERIAL PRIMARY KEY,
      chat_id      TEXT NOT NULL,
      platform     TEXT NOT NULL,
      role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      user_id      TEXT,
      display_name TEXT,
      content      TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conv_messages_lookup
      ON conversation_messages (platform, chat_id, created_at DESC)
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM commands');
  if (rows[0].count === '0') {
    await pool.query(`
      INSERT INTO commands (trigger, response) VALUES
      ('!ping',  'pong! 🏓'),
      ('!ajuda', '📋 *Comandos disponíveis:*\n\n!!sticker — transforma imagem/vídeo em figurinha\n!!ping — testa se estou online')
    `);
    console.log('[db] default commands seeded');
  }
}
