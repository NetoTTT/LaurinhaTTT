import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { pool } from '../db/database';

export async function handleClearCommand(message: PlatformMessage): Promise<PlatformResponse> {
  const { chatId, platform } = message;
  const result = await pool.query(
    'DELETE FROM conversation_messages WHERE chat_id = $1 AND platform = $2',
    [chatId, platform],
  );
  return {
    chatId,
    platform,
    replyTo: message.id,
    content: { type: 'text', text: `contexto limpo (${result.rowCount} msgs apagadas)` },
  };
}
