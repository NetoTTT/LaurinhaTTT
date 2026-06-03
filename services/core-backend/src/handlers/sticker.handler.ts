import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { imageToSticker, videoToSticker, base64ToBuffer, bufferToBase64 } from '../media/sticker.service';
import { upsertUser } from '../db/users.repository';
import { saveSticker } from '../db/catalog.repository';

export async function handleStickerCommand(message: PlatformMessage): Promise<PlatformResponse | null> {
  const { content, chatId, platform, id, quotedMessage } = message;

  console.log(`[sticker] content.type=${content.type}, media.mimetype=${content.media?.mimetype}, quoted.type=${quotedMessage?.type}`);

  const acceptedTypes = ['image', 'video'];

  let mediaBase64: string | undefined;
  let mediaType: string | undefined;
  let mediaMimetype: string | undefined;

  if (acceptedTypes.includes(content.type) && content.media?.base64) {
    mediaBase64 = content.media.base64;
    mediaType = content.type;
    mediaMimetype = content.media.mimetype;
    console.log(`[sticker] usando mídia da mensagem: tipo=${mediaType}, mimetype=${mediaMimetype}`);
  } else if (quotedMessage && acceptedTypes.includes(quotedMessage.type) && quotedMessage.media?.base64) {
    mediaBase64 = quotedMessage.media.base64;
    mediaType = quotedMessage.type;
    mediaMimetype = quotedMessage.media?.mimetype;
    console.log(`[sticker] usando quoted message: tipo=${mediaType}, mimetype=${mediaMimetype}`);
  } else {
    console.log(`[sticker] nenhuma mídia encontrada! content.type=${content.type}, quoted=${quotedMessage?.type}`);
  }

  if (!mediaBase64) {
    return {
      chatId,
      platform,
      replyTo: id,
      content: { type: 'text', text: 'Manda uma imagem ou vídeo/GIF junto com !!sticker, ou responde um com !!sticker 🎨' },
    };
  }

  try {
    console.log(`[sticker] processing ${mediaType} (${mediaMimetype})`);
    const inputBuffer = base64ToBuffer(mediaBase64);

    const stickerBuffer = mediaType === 'video'
      ? await videoToSticker(inputBuffer, mediaMimetype ?? 'video/mp4')
      : await imageToSticker(inputBuffer);

    // Salva no catálogo (fire-and-forget — não atrasa a resposta)
    upsertUser(platform, message.userId, message.userName)
      .then(user => saveSticker(user.id, stickerBuffer, 'image/webp'))
      .catch(err => console.error('[sticker] catalog save failed:', (err as Error).message));

    return {
      chatId,
      platform,
      replyTo: id,
      content: {
        type: 'sticker',
        media: {
          mimetype: 'image/webp',
          base64: bufferToBase64(stickerBuffer),
        },
      },
    };
  } catch (err) {
    console.error('[sticker] processing error', (err as Error).message);
    return {
      chatId,
      platform,
      replyTo: id,
      content: { type: 'text', text: `Erro ao converter para sticker. Tenta com outra ${mediaType}! 😅` },
    };
  }
}
