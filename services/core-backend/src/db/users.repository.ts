import { pool } from './database';

export interface User {
  id: number;
  platform: string;
  platform_id: string;
  display_name: string | null;
  created_at: Date;
}

export async function upsertUser(platform: string, platformId: string, displayName: string): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (platform, platform_id, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (platform, platform_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [platform, platformId, displayName],
  );
  return rows[0];
}
