import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { processWithAI } from '../ai/lmstudio';
import { getConversationHistory, saveContextMessage } from '../db/context.repository';
import { bufferToBase64 } from '../media/sticker.service';
import { publishOutbound } from '../bus/redis';

function describeContent(msg: PlatformMessage): string {
  const { content } = msg;
  if (content.type === 'text') return content.text ?? '';
  if (content.type === 'image') return `[imagem${content.media?.caption ? ': ' + content.media.caption : ''}]`;
  if (content.type === 'video') return `[vídeo${content.media?.caption ? ': ' + content.media.caption : ''}]`;
  if (content.type === 'audio') return '[áudio]';
  if (content.type === 'sticker') return '[figurinha]';
  return `[${content.type}]`;
}

export async function handleAIMessage(message: PlatformMessage): Promise<PlatformResponse | null> {
  const { chatId, platform, userId, userName, isGroup, content, id } = message;

  // Não processar mídia passiva sem texto
  if (['sticker', 'audio', 'document'].includes(content.type)) return null;

  const textForContext = describeContent(message);

  try {
    await saveContextMessage(chatId, platform, 'user', textForContext, userId, userName);

    const history = await getConversationHistory(chatId, platform, 20);
    // Remove a última mensagem (recém salva) — já está em `current`
    const historyWithoutCurrent = history.slice(0, -1);

    const result = await processWithAI(
      { text: textForContext, userName, isGroup: isGroup ?? false, platform, userId },
      historyWithoutCurrent,
    );

    if (result.type === 'silent') return null;

    if (result.type === 'sticker') {
      await saveContextMessage(chatId, platform, 'assistant', '[enviou uma figurinha]');
      return {
        chatId, platform, replyTo: id,
        content: { type: 'sticker', media: { mimetype: 'image/webp', base64: bufferToBase64(result.data) } },
      };
    }

    if (result.type === 'text+sticker') {
      await saveContextMessage(chatId, platform, 'assistant', result.text + ' [+ figurinha]');
      // Envia texto primeiro, depois figurinha (fire-and-forget via Redis com pequeno delay)
      setTimeout(() => {
        publishOutbound({
          chatId, platform,
          content: { type: 'sticker', media: { mimetype: 'image/webp', base64: bufferToBase64(result.data) } },
        }).catch(console.error);
      }, 800);
      return {
        chatId, platform, replyTo: id,
        content: { type: 'text', text: result.text },
      };
    }

    await saveContextMessage(chatId, platform, 'assistant', result.text);
    return {
      chatId, platform, replyTo: id,
      content: { type: 'text', text: result.text },
    };
  } catch (err) {
    console.error('[ai] error:', (err as Error).message);
    return null;
  }
}
