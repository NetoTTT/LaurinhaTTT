import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { processWithAI, type AIAudioResponse } from '../ai/ai-engine';
import { getConversationHistory, saveContextMessage } from '../db/context.repository';
import { bufferToBase64 } from '../media/sticker.service';
import { publishOutbound } from '../bus/redis';
import { trackSentMessage } from '../router/command.router';
import { getStickerIdByData } from '../db/catalog.repository';

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

  let textForContext = describeContent(message);

  // Se é reply a uma figurinha, resolve o ID no banco e injeta no contexto
  // → a IA verá "[respondendo à figurinha #42]" e saberá o ID sem o usuário digitar
  if (message.quotedMessage?.type === 'sticker' && message.quotedMessage.media?.base64) {
    try {
      const stickerBuf = Buffer.from(message.quotedMessage.media.base64, 'base64');
      const stickerId = await getStickerIdByData(stickerBuf);
      if (stickerId) {
        textForContext += ` [respondendo à figurinha #${stickerId}]`;
      }
    } catch { /* ignora falha de lookup */ }
  }

  try {
    await saveContextMessage(chatId, platform, 'user', textForContext, userId, userName);

    const history = await getConversationHistory(chatId, platform, 20);
    // Remove a última mensagem (recém salva) — já está em `current`
    const historyWithoutCurrent = history.slice(0, -1);

    const result = await processWithAI(
      { text: textForContext, userName, isGroup: isGroup ?? false, platform, userId, chatId },
      historyWithoutCurrent,
    );

    if (result.type === 'silent') return null;

    if (result.type === 'audio') {
      const audioResult = result as AIAudioResponse;
      try {
        await saveContextMessage(chatId, platform, 'assistant', '[enviou áudio]');
        return {
          chatId, platform, replyTo: id,
          content: {
            type: 'audio',
            text: audioResult.text, // fallback caso o adapter não consiga enviar o arquivo
            media: { mimetype: 'audio/ogg; codecs=opus', base64: audioResult.data.toString('base64') },
          },
        };
      } catch (audioErr) {
        console.error('[ai] audio send failed, falling back to text:', (audioErr as Error).message);
        await saveContextMessage(chatId, platform, 'assistant', audioResult.text);
        return { chatId, platform, replyTo: id, content: { type: 'text', text: audioResult.text } };
      }
    }

    if (result.type === 'sticker') {
      const stickerLabel = result.mediaFileId > 0 ? `[enviou figurinha #${result.mediaFileId}]` : '[enviou uma figurinha]';
      await saveContextMessage(chatId, platform, 'assistant', stickerLabel);
      return {
        chatId, platform, replyTo: id,
        content: { type: 'sticker', media: { mimetype: 'image/webp', base64: bufferToBase64(result.data) } },
      };
    }

    if (result.type === 'text+sticker') {
      const stickerLabel = result.mediaFileId > 0 ? `[enviou figurinha #${result.mediaFileId}]` : '[figurinha]';
      await saveContextMessage(chatId, platform, 'assistant', result.text + ` [+ ${stickerLabel}]`);
      // Envia texto primeiro, depois figurinha (fire-and-forget via Redis com pequeno delay)
      setTimeout(() => {
        publishOutbound({
          chatId, platform, replyTo: id,
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
