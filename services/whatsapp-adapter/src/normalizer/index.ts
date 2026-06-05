import type { PlatformMessage, ContentType, MediaContent } from '@laurinha/shared-types';

interface EvolutionMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
  instance?: string;
}

function extractQuotedMessage(data: EvolutionMessageData): PlatformMessage['quotedMessage'] | undefined {
  const msg = data.message ?? {};

  // Verificar em extendedTextMessage.contextInfo
  if (msg.extendedTextMessage) {
    const ext = msg.extendedTextMessage as Record<string, unknown>;
    const contextInfo = ext.contextInfo as Record<string, unknown>;
    if (contextInfo?.quotedMessage) {
      const quoted = contextInfo.quotedMessage as Record<string, unknown>;
      const quotedMsg = quoted.message as Record<string, unknown>;

      let quotedType: ContentType = 'text';
      let quotedText: string | undefined;

      if (quotedMsg?.conversation) {
        quotedText = quotedMsg.conversation as string;
      } else if (quotedMsg?.extendedTextMessage) {
        const ext2 = quotedMsg.extendedTextMessage as Record<string, unknown>;
        quotedText = ext2.text as string;
      } else if (quotedMsg?.imageMessage) {
        quotedType = 'image';
      } else if (quotedMsg?.videoMessage) {
        quotedType = 'video';
      } else if (quotedMsg?.stickerMessage) {
        quotedType = 'sticker';
      } else if (quotedMsg?.documentMessage) {
        quotedType = 'document';
      }

      const stanzaId = contextInfo.stanzaId as string | undefined;
      if (stanzaId) {
        return {
          id: stanzaId,
          type: quotedType,
          text: quotedText,
        };
      }
    }
  }

  return undefined;
}

function extractContent(data: EvolutionMessageData): {
  type: ContentType;
  text?: string;
  media?: MediaContent;
} {
  const msg = data.message ?? {};

  if (msg.conversation) {
    return { type: 'text', text: msg.conversation as string };
  }

  if (msg.extendedTextMessage) {
    const ext = msg.extendedTextMessage as Record<string, unknown>;
    return { type: 'text', text: ext.text as string };
  }

  if (msg.imageMessage) {
    const image = msg.imageMessage as Record<string, unknown>;
    return {
      type: 'image',
      text: image.caption as string | undefined,
      media: {
        mimetype: (image.mimetype as string) ?? 'image/jpeg',
        caption: image.caption as string | undefined,
        base64: image.base64 as string | undefined,
        url: image.url as string | undefined,
      },
    };
  }

  if (msg.videoMessage) {
    const video = msg.videoMessage as Record<string, unknown>;
    return {
      type: 'video',
      text: video.caption as string | undefined,
      media: {
        mimetype: (video.mimetype as string) ?? 'video/mp4',
        caption: video.caption as string | undefined,
        base64: video.base64 as string | undefined,
        url: video.url as string | undefined,
      },
    };
  }

  if (msg.audioMessage || msg.pttMessage) {
    const audio = (msg.audioMessage ?? msg.pttMessage) as Record<string, unknown>;
    return {
      type: 'audio',
      media: {
        mimetype: (audio.mimetype as string) ?? 'audio/ogg',
        base64: audio.base64 as string | undefined,
        url: audio.url as string | undefined,
      },
    };
  }

  if (msg.stickerMessage) {
    const sticker = msg.stickerMessage as Record<string, unknown>;
    return {
      type: 'sticker',
      media: {
        mimetype: (sticker.mimetype as string) ?? 'image/webp',
        base64: sticker.base64 as string | undefined,
        url: sticker.url as string | undefined,
      },
    };
  }

  if (msg.documentMessage) {
    const doc = msg.documentMessage as Record<string, unknown>;
    return {
      type: 'document',
      media: {
        mimetype: (doc.mimetype as string) ?? 'application/octet-stream',
        filename: doc.fileName as string | undefined,
        base64: doc.base64 as string | undefined,
        url: doc.url as string | undefined,
      },
    };
  }

  return { type: 'text', text: '' };
}

export function normalizeEvolutionMessage(data: EvolutionMessageData): PlatformMessage | null {
  if (data.key.fromMe) return null;

  const isGroup = data.key.remoteJid.endsWith('@g.us');
  const userId = isGroup ? (data.key.participant ?? data.key.remoteJid) : data.key.remoteJid;

  const quotedMessage = extractQuotedMessage(data);

  const message: PlatformMessage = {
    id: data.key.id,
    platform: 'whatsapp',
    chatId: data.key.remoteJid,
    userId,
    userName: data.pushName ?? userId.replace(/@.+/, ''),
    isGroup,
    groupId: isGroup ? data.key.remoteJid : undefined,
    content: extractContent(data),
    timestamp: (data.messageTimestamp ?? Date.now() / 1000) * 1000,
    raw: data,
  };

  if (quotedMessage) {
    message.quotedMessage = quotedMessage;
  }

  return message;
}
