import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import type { Message } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import type { PlatformMessage, PlatformResponse, ContentType } from '@laurinha/shared-types';
import { config } from '../config';

export type ConnectionState = 'initializing' | 'qr' | 'authenticated' | 'ready' | 'disconnected';

interface ClientStatus {
  state: ConnectionState;
  qrBase64: string | null;
  pushName: string | null;
  number: string | null;
}

const status: ClientStatus = {
  state: 'initializing',
  qrBase64: null,
  pushName: null,
  number: null,
};

let client: pkg.Client;
let onInboundMessage: ((msg: PlatformMessage) => void) | null = null;

export function getStatus(): ClientStatus {
  return { ...status };
}

export function setInboundHandler(handler: (msg: PlatformMessage) => void): void {
  onInboundMessage = handler;
}

function mapContentType(msg: Message): ContentType {
  if (msg.type === 'image') return 'image';
  if (msg.type === 'video') return 'video';
  if (msg.type === 'ptt' || msg.type === 'audio') return 'audio';
  if (msg.type === 'sticker') return 'sticker';
  if (msg.type === 'document') return 'document';
  return 'text';
}

async function normalizeMessage(msg: Message): Promise<PlatformMessage> {
  const type = mapContentType(msg);
  const chat = await msg.getChat();
  const contact = await msg.getContact();

  let media: PlatformMessage['content']['media'];
  if (msg.hasMedia) {
    const downloaded = await msg.downloadMedia();
    if (downloaded) {
      media = {
        mimetype: downloaded.mimetype,
        base64: downloaded.data,
        caption: msg.body || undefined,
        filename: downloaded.filename ?? undefined,
      };
    }
  }

  // Extrair informações da mensagem respondida
  let quotedMessage: PlatformMessage['quotedMessage'];
  if (msg.hasQuotedMsg) {
    const quoted = await msg.getQuotedMessage();
    if (quoted) {
      const quotedType = mapContentType(quoted);
      let quotedMedia: PlatformMessage['content']['media'];

      if (quoted.hasMedia) {
        const downloadedQuoted = await quoted.downloadMedia();
        if (downloadedQuoted) {
          quotedMedia = {
            mimetype: downloadedQuoted.mimetype,
            base64: downloadedQuoted.data,
            filename: downloadedQuoted.filename ?? undefined,
          };
        }
      }

      quotedMessage = {
        id: quoted.id._serialized,
        type: quotedType,
        text: quotedType === 'text' ? quoted.body : undefined,
        media: quotedMedia,
      };
    }
  }

  return {
    id: msg.id._serialized,
    platform: 'whatsapp',
    chatId: msg.from,
    userId: contact.id._serialized,
    userName: contact.pushname || contact.name || msg.from.replace(/@.+/, ''),
    isGroup: chat.isGroup,
    groupId: chat.isGroup ? msg.from : undefined,
    content: {
      type,
      text: type === 'text' ? msg.body : msg.body || undefined,
      media,
    },
    ...(quotedMessage && { quotedMessage }),
    timestamp: msg.timestamp * 1000,
  };
}

export async function sendResponse(response: PlatformResponse): Promise<void> {
  if (status.state !== 'ready') {
    console.warn('[wa] cannot send, client not ready');
    return;
  }

  const { chatId, content } = response;

  if (content.type === 'text') {
    await client.sendMessage(chatId, content.text ?? '');
    return;
  }

  if (content.media?.base64) {
    const media = new MessageMedia(
      content.media.mimetype,
      content.media.base64,
      content.media.filename,
    );
    await client.sendMessage(chatId, media, {
      caption: content.media.caption ?? content.text,
      sendMediaAsSticker: content.type === 'sticker',
    });
  }
}

export async function initWhatsApp(): Promise<void> {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
    puppeteer: {
      headless: true,
      executablePath: config.chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--single-process',
      ],
    },
  });

  client.on('qr', async (qr) => {
    status.state = 'qr';
    status.qrBase64 = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    console.log('[wa] QR code generated — scan via dashboard');
  });

  client.on('authenticated', () => {
    status.state = 'authenticated';
    status.qrBase64 = null;
    console.log('[wa] authenticated');
  });

  client.on('ready', () => {
    status.state = 'ready';
    status.qrBase64 = null;
    status.pushName = client.info?.pushname ?? null;
    status.number = client.info?.wid?.user ?? null;
    console.log(`[wa] ready as ${status.pushName} (${status.number})`);
  });

  client.on('disconnected', (reason) => {
    status.state = 'disconnected';
    status.qrBase64 = null;
    console.warn('[wa] disconnected:', reason);
    // whatsapp-web.js tenta reconectar; se cair de vez, reinicializa
    setTimeout(() => client.initialize().catch((e) => console.error('[wa] reinit error', e)), 5000);
  });

  client.on('message', async (msg) => {
    try {
      const normalized = await normalizeMessage(msg);
      onInboundMessage?.(normalized);
      console.log(`[wa] inbound from ${normalized.userName} (${normalized.content.type})`);
    } catch (err) {
      console.error('[wa] normalize error', (err as Error).message);
    }
  });

  console.log('[wa] initializing whatsapp-web.js client...');
  await client.initialize();
}

export async function logout(): Promise<void> {
  try {
    await client.logout();
    status.state = 'disconnected';
    status.qrBase64 = null;
  } catch (err) {
    console.error('[wa] logout error', (err as Error).message);
  }
}

export async function destroyClient(): Promise<void> {
  try {
    await client.destroy();
  } catch {
    /* ignore */
  }
}
