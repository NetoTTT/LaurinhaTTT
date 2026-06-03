import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { handleStickerCommand } from '../handlers/sticker.handler';
import { handlePingCommand } from '../handlers/ping.handler';
import { handleAIMessage } from '../handlers/ai.handler';
import { handleClearCommand } from '../handlers/clear.handler';

const AI_COMMANDS = new Set(['laura', 'laurinha', 'la', 'lara']);

export async function routeMessage(message: PlatformMessage): Promise<PlatformResponse | null> {
  const text = message.content.text?.trim() ?? '';
  const lower = text.toLowerCase();

  if (lower.startsWith('!!')) {
    const name = lower.slice(2).trim().split(/\s+/)[0];
    console.log(`[command] !! from ${message.userName}: ${name}`);

    if (AI_COMMANDS.has(name)) {
      const aiText = text.slice(2 + name.length).trim();
      const aiMessage: PlatformMessage = {
        ...message,
        content: { ...message.content, type: 'text', text: aiText || '👋' },
      };
      return handleAIMessage(aiMessage);
    }

    switch (name) {
      case 'sticker':
        return handleStickerCommand(message);
      case 'ping':
        return handlePingCommand(message);
      case 'clear':
        return handleClearCommand(message);
      default:
        return null;
    }
  }

  return null;
}
