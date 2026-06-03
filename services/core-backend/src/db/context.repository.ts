import { pool } from './database';

export interface ConversationMessage {
  id: bigint;
  chat_id: string;
  platform: string;
  role: 'user' | 'assistant';
  user_id: string | null;
  display_name: string | null;
  content: string;
  created_at: Date;
}

export async function saveContextMessage(
  chatId: string,
  platform: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string,
  displayName?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO conversation_messages (chat_id, platform, role, content, user_id, display_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [chatId, platform, role, content, userId ?? null, displayName ?? null],
  );
}

export async function getConversationHistory(
  chatId: string,
  platform: string,
  limit = 20,
): Promise<ConversationMessage[]> {
  const { rows } = await pool.query<ConversationMessage>(
    `SELECT * FROM (
       SELECT * FROM conversation_messages
       WHERE chat_id = $1 AND platform = $2
       ORDER BY created_at DESC
       LIMIT $3
     ) sub ORDER BY created_at ASC`,
    [chatId, platform, limit],
  );
  return rows;
}
