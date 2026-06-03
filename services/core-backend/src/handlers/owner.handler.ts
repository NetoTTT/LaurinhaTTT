import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';

let ownerCommandsCache = new Map<string, string>();

export function reloadOwnerCommandsCache(commands: Map<string, string>): void {
  ownerCommandsCache = commands;
  console.log(`[owner-commands] cache reloaded — ${commands.size} commands`);
}

export function handleOwnerCommand(message: PlatformMessage): PlatformResponse | null {
  const text = message.content.text?.trim() ?? '';
  // !!ping -> !ping (strips one !)
  const trigger = '!' + text.toLowerCase().slice(2);

  const response = ownerCommandsCache.get(trigger);
  if (!response) return null;

  return {
    chatId: message.chatId,
    platform: message.platform,
    replyTo: message.id,
    content: { type: 'text', text: response },
  };
}