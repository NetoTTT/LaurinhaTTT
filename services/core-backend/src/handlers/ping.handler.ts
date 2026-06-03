import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';

export async function handlePingCommand(message: PlatformMessage): Promise<PlatformResponse> {
  return {
    chatId: message.chatId,
    platform: message.platform,
    replyTo: message.id,
    content: { type: 'text', text: 'pong! 🏓' },
  };
}
