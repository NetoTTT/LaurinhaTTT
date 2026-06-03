import { pool } from './database';

export interface Command {
  id: number;
  trigger: string;
  response: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getAllCommands(): Promise<Command[]> {
  const { rows } = await pool.query('SELECT * FROM commands ORDER BY created_at');
  return rows;
}

export async function getEnabledCommandsMap(): Promise<Map<string, string>> {
  const { rows } = await pool.query('SELECT trigger, response FROM commands WHERE enabled = TRUE');
  return new Map(rows.map((r: { trigger: string; response: string }) => [r.trigger, r.response]));
}

export async function createCommand(trigger: string, response: string): Promise<Command> {
  const { rows } = await pool.query(
    'INSERT INTO commands (trigger, response) VALUES ($1, $2) RETURNING *',
    [trigger.toLowerCase().trim(), response],
  );
  return rows[0] as Command;
}

export async function updateCommand(
  id: number,
  data: { response?: string; enabled?: boolean },
): Promise<Command> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let idx = 1;

  if (data.response !== undefined) { sets.push(`response = $${idx++}`); values.push(data.response); }
  if (data.enabled !== undefined)  { sets.push(`enabled  = $${idx++}`); values.push(data.enabled); }
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE commands SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] as Command;
}

export async function deleteCommand(id: number): Promise<void> {
  await pool.query('DELETE FROM commands WHERE id = $1', [id]);
}
