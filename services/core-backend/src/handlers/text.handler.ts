import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';

let commandsCache = new Map<string, string>();

export function reloadCommandsCache(commands: Map<string, string>): void {
  commandsCache = commands;
  console.log(`[commands] cache reloaded — ${commands.size} commands`);
}

export function handleTextMessage(message: PlatformMessage): PlatformResponse | null {
  const text = message.content.text?.trim().toLowerCase() ?? '';
  const response = commandsCache.get(text);
  if (!response) return null;

  return {
    chatId: message.chatId,
    platform: message.platform,
    replyTo: message.id,
    content: { type: 'text', text: response },
  };
}
