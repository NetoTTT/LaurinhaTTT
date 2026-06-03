import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import type { Message } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import { rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PlatformMessage, PlatformResponse, ContentType } from '@laurinha/shared-types';
import { config } from '../config';
import { trackAIMessageSent } from '../tracker/ai-messages';

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

async function resolveMentions(msg: Message, text: string): Promise<string> {
  const ids: string[] = (msg as any).mentionedIds ?? [];
  console.log(`[wa] resolveMentions: text="${text.substring(0, 40)}" mentionedIds=${JSON.stringify(ids)}`);
  if (!ids.length) return text;

  let resolved = text;
  for (const id of ids) {
    const numeric = id.replace(/@c\.us$|@lid$/, '');
    let name: string | null = null;

    // Tenta getContactById
    try {
      const contact = await client.getContactById(id);
      name = contact.pushname || contact.shortName || contact.name || null;
    } catch {
      // fallback: tenta buscar nos participantes do grupo
      try {
        const chat = await msg.getChat();
        const participants: any[] = (chat as any).participants ?? [];
        const participant = participants.find((p: any) =>
          p.id?._serialized === id || p.id?.user === numeric,
        );
        if (participant) {
          name = participant.id?.user ?? null;
        }
      } catch {
        // ignora
      }
    }

    if (name) {
      resolved = resolved.replace(new RegExp(`@${numeric}`, 'g'), `@${name}`);
      console.log(`[wa] mention resolved: @${numeric} → @${name}`);
    } else {
      console.warn(`[wa] mention NOT resolved: id=${id}`);
    }
  }
  return resolved;
}

async function normalizeMessage(msg: Message): Promise<PlatformMessage> {
  // DEBUG
  if (msg.fromMe) {
    console.log(`[wa] normalizeMessage FROMME: msg.type=${(msg as any).type}, msg.hasMedia=${msg.hasMedia}, body="${msg.body?.substring(0, 30)}"`);
  }

  const type = mapContentType(msg);
  const chat = await msg.getChat();

  let contact;
  let userName = 'Me';

  try {
    contact = await msg.getContact();
    userName = contact.pushname || contact.name || msg.from.replace(/@.+/, '');
  } catch (err) {
    // Mensagens fromMe podem falhar em getContact() — usar fallback
    console.warn('[wa] getContact failed (likely fromMe):', (err as Error).message);
    contact = { id: { _serialized: msg.from } };
  }

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
  console.log(`[wa] normalizeMessage: msg.hasQuotedMsg=${msg.hasQuotedMsg}`);
  if (msg.hasQuotedMsg) {
    console.log(`[wa] Tentando extrair quoted message...`);
    try {
      const quoted = await msg.getQuotedMessage();
      if (quoted) {
        console.log(`[wa] Quoted message extraída! type=${quoted.type}, hasMedia=${quoted.hasMedia}`);
        const quotedType = mapContentType(quoted);
        let quotedMedia: PlatformMessage['content']['media'];

        if (quoted.hasMedia) {
          console.log(`[wa] Quoted tem mídia, fazendo download...`);
          const downloadedQuoted = await quoted.downloadMedia();
          if (downloadedQuoted) {
            console.log(`[wa] Download da quoted mídia bem-sucedido`);
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
        console.log(`[wa] quotedMessage criada com sucesso`);
      } else {
        console.log(`[wa] getQuotedMessage retornou null`);
      }
    } catch (err) {
      console.error(`[wa] Erro ao extrair quoted message:`, (err as Error).message);
    }
  }

  const resolvedText = type === 'text' ? await resolveMentions(msg, msg.body ?? '') : (msg.body || undefined);

  return {
    id: msg.id._serialized,
    platform: 'whatsapp',
    chatId: msg.from,
    userId: contact.id._serialized,
    userName,
    isGroup: chat.isGroup,
    groupId: chat.isGroup ? msg.from : undefined,
    content: {
      type,
      text: type === 'text' ? resolvedText : msg.body || undefined,
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

  const { chatId, content, replyTo } = response;
  const quoteOpts = replyTo ? { quotedMessageId: replyTo } : {};

  if (content.type === 'text') {
    const msg = await client.sendMessage(chatId, content.text ?? '', quoteOpts);
    // Rastreia mensagem da IA para auto-reply sem prefixo
    if (msg?.id?._serialized) {
      await trackAIMessageSent(msg.id._serialized, chatId, 'laurinha');
    }
    return;
  }

  if (content.media?.base64) {
    const media = new MessageMedia(
      content.media.mimetype,
      content.media.base64,
      content.media.filename,
    );
    const msg = await client.sendMessage(chatId, media, {
      ...quoteOpts,
      caption: content.media.caption ?? content.text,
      sendMediaAsSticker: content.type === 'sticker',
    });
    // Rastreia mensagem da IA
    if (msg?.id?._serialized) {
      await trackAIMessageSent(msg.id._serialized, chatId, 'laurinha');
    }
  }
}

function cleanSessionLocks(): void {
  const sessionDir = config.sessionPath;
  try {
    const lockFiles = [
      sessionDir + '/session/SingletonLock',
      sessionDir + '/session/SingletonCookie',
      sessionDir + '/session/SingletonSocket',
    ];
    for (const f of lockFiles) {
      if (existsSync(f)) {
        rmSync(f);
        console.log('[wa] removed lock file:', f);
      }
    }
  } catch (err) {
    console.warn('[wa] could not clean locks:', (err as Error).message);
  }
}

export async function initWhatsApp(): Promise<void> {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
    puppeteer: {
      headless: 'new' as const,
      executablePath: config.chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
      ],
    },
  });

  client.on('qr', async (qr) => {
    status.state = 'qr';
    status.qrBase64 = await QRCode.toDataURL(qr, { margin: 1, width: 320 });

    console.log('\n' + '='.repeat(50));
    console.log('[wa] 📱 QR CODE GENERATED — SCAN WITH WHATSAPP');
    console.log('='.repeat(50));
    qrcode.generate(qr, { small: true });
    console.log('='.repeat(50));
    console.log('[wa] Instructions:');
    console.log('  1. Open WhatsApp on your phone');
    console.log('  2. Go to Settings → Linked Devices');
    console.log('  3. Tap "Link a Device"');
    console.log('  4. Point your phone camera at the QR code above');
    console.log('='.repeat(50) + '\n');
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
    client.destroy().catch(() => {});
    cleanSessionLocks();
    setTimeout(() => {
      cleanSessionLocks();
      client.initialize().catch((e) => console.error('[wa] reinit error', e));
    }, 10000);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return; // message_create handles owner messages
    try {
      const normalized = await normalizeMessage(msg);
      onInboundMessage?.(normalized);
      console.log(`[wa] inbound from ${normalized.userName} (${normalized.content.type})`);
    } catch (err) {
      console.error('[wa] normalize error', (err as Error).message);
    }
  });

  // Captura mensagens criadas pelo próprio número (incluindo respostas do dono)
  // Solução: usar getChat() e extrair mídia corretamente
  client.on('message_create', async (msg) => {
    if (!msg.fromMe) return; // Só processa mensagens do próprio número

    const text = msg.body?.trim() ?? '';
    if (!text.startsWith('!')) return; // Só processa se começa com !

    try {
      // DEBUG: Log do tipo e hasMedia
      console.log(`[wa] message_create DEBUG: msg.type=${(msg as any).type}, msg.hasMedia=${msg.hasMedia}, msg.body="${text.substring(0, 30)}"`);

      // Usar getChat() para obter o chat correto (grupo ou contato)
      const chat = await msg.getChat();
      const chatId = chat.id._serialized;
      const isGroup = chat.isGroup;
      const type = mapContentType(msg);

      console.log(`[wa] message_create after mapContentType: type=${type}`);

      // Extrair mídia se houver
      let media: PlatformMessage['content']['media'];
      if (msg.hasMedia) {
        console.log(`[wa] message_create tem mídia! Fazendo download...`);
        const downloaded = await msg.downloadMedia();
        if (downloaded) {
          console.log(`[wa] Download bem-sucedido: mimetype=${downloaded.mimetype}`);
          media = {
            mimetype: downloaded.mimetype,
            base64: downloaded.data,
            caption: msg.body || undefined,
            filename: downloaded.filename ?? undefined,
          };
        }
      } else {
        console.log(`[wa] message_create sem mídia (msg.hasMedia=false)`);
      }

      // Extrair quoted message (necessário para !!sticker como resposta a imagem)
      let quotedMessage: PlatformMessage['quotedMessage'];
      if (msg.hasQuotedMsg) {
        try {
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
        } catch (err) {
          console.error(`[wa] message_create: erro ao extrair quoted:`, (err as Error).message);
        }
      }

      const resolvedText = type === 'text' ? await resolveMentions(msg, text) : (text || undefined);

      const message: PlatformMessage = {
        id: msg.id._serialized,
        platform: 'whatsapp',
        chatId,
        userId: msg.from,
        userName: 'Owner',
        isGroup,
        groupId: isGroup ? chatId : undefined,
        content: {
          type,
          text: type === 'text' ? resolvedText : text || undefined,
          media,
        },
        ...(quotedMessage && { quotedMessage }),
        timestamp: msg.timestamp * 1000,
      };

      onInboundMessage?.(message);
      console.log(`[wa] inbound (owner) in ${isGroup ? 'group' : 'contact'} [${type}]: ${text.substring(0, 40)}`);
    } catch (err) {
      console.error('[wa] message_create error:', (err as Error).message);
    }
  });

  cleanSessionLocks();
  console.log('[wa] initializing whatsapp-web.js client...');
  try {
    await client.initialize();
  } catch (err) {
    console.error('[wa] init failed:', (err as Error).message);
    client.destroy().catch(() => {});
    cleanSessionLocks();
    setTimeout(() => {
      console.log('[wa] retrying initialization...');
      client.initialize().catch((e) => console.error('[wa] retry failed:', e.message));
    }, 10000);
  }
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
