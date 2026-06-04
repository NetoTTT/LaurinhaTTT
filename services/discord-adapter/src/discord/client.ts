import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  Events,
  type Message,
  type TextChannel,
  type DMChannel,
  type NewsChannel,
  type AnyThreadChannel,
} from 'discord.js';
import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { config } from '../config';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

type SendableChannel = TextChannel | DMChannel | NewsChannel | AnyThreadChannel;

let onInboundMessage: ((msg: PlatformMessage) => void) | null = null;

export function setInboundHandler(handler: (msg: PlatformMessage) => void): void {
  onInboundMessage = handler;
}

// Determina se a mensagem deve ser processada pela IA
async function shouldProcess(message: Message): Promise<boolean> {
  const lower = message.content.trim().toLowerCase();

  // DM ao bot — sempre processa
  if (!message.guild) return true;

  // Menção direta ao bot (@Laura)
  if (message.mentions.has(client.user!.id)) return true;

  // Prefixo !! (comandos e invocação da IA)
  if (lower.startsWith('!!')) return true;

  // Resposta a uma mensagem do bot
  if (message.reference?.messageId) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      if (referenced.author.id === client.user!.id) return true;
    } catch {
      // mensagem deletada ou inacessível
    }
  }

  return false;
}

function normalizeContent(message: Message): string {
  // Remove a menção ao bot do início do texto
  let text = message.content
    .replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '')
    .trim();

  return text || '👋';
}

async function normalizeMessage(message: Message): Promise<PlatformMessage> {
  const isOwner = message.author.id === config.ownerDiscordId;
  const isDM = !message.guild;
  const chatId = message.channelId;
  const userId = message.author.id;
  const userName = isOwner ? 'Owner' : (message.member?.displayName ?? message.author.username);

  let media: PlatformMessage['content']['media'] | undefined;
  let contentType: PlatformMessage['content']['type'] = 'text';

  // Trata anexos (imagem, vídeo, áudio, documento)
  const attachment = message.attachments.first();
  if (attachment) {
    const mime = attachment.contentType ?? 'application/octet-stream';
    if (mime.startsWith('image/')) contentType = 'image';
    else if (mime.startsWith('video/')) contentType = 'video';
    else if (mime.startsWith('audio/')) contentType = 'audio';
    else contentType = 'document';

    // Faz download do anexo para base64
    try {
      const res = await fetch(attachment.url);
      const buf = Buffer.from(await res.arrayBuffer());
      media = {
        mimetype: mime,
        base64: buf.toString('base64'),
        filename: attachment.name ?? undefined,
      };
    } catch {
      // ignora falha de download
    }
  }

  // Mensagem respondida (quoted)
  let quotedMessage: PlatformMessage['quotedMessage'] | undefined;
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      quotedMessage = {
        id: ref.id,
        type: 'text',
        text: ref.content || undefined,
      };
    } catch {
      // ignora
    }
  }

  return {
    id: message.id,
    platform: 'discord',
    chatId,
    userId,
    userName,
    isGroup: !isDM,
    groupId: message.guild?.id,
    content: {
      type: contentType,
      text: normalizeContent(message),
      media,
    },
    ...(quotedMessage && { quotedMessage }),
    timestamp: message.createdTimestamp,
  };
}

// Mapeia chatId → channelId para envio de respostas
const channelCache = new Map<string, SendableChannel>();

async function getChannel(channelId: string): Promise<SendableChannel | null> {
  const cached = channelCache.get(channelId);
  if (cached) return cached;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased()) {
      channelCache.set(channelId, ch as SendableChannel);
      return ch as SendableChannel;
    }
  } catch {
    // canal não encontrado
  }
  return null;
}

// Divide texto longo respeitando o limite de 2000 chars do Discord
function splitMessage(text: string, maxLength = 1900): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    // Tenta quebrar em newline próximo ao limite
    let cut = maxLength;
    const nl = remaining.lastIndexOf('\n', maxLength);
    if (nl > maxLength * 0.6) cut = nl + 1;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

export async function sendResponse(response: PlatformResponse): Promise<void> {
  const channel = await getChannel(response.chatId);
  if (!channel) {
    console.warn(`[discord] canal não encontrado: ${response.chatId}`);
    return;
  }

  const replyOpts = response.replyTo ? { reply: { messageReference: response.replyTo } } : {};

  const { content } = response;

  if (content.type === 'text' && content.text) {
    const chunks = splitMessage(content.text);
    for (const [i, chunk] of chunks.entries()) {
      await (channel as TextChannel).send({ content: chunk, ...(i === 0 ? replyOpts : {}) });
    }
    return;
  }

  if (content.media?.base64) {
    const buf = Buffer.from(content.media.base64, 'base64');
    const ext = content.media.mimetype?.split('/')[1] ?? 'bin';
    const filename = content.media.filename ?? `arquivo.${ext}`;
    const attachment = new AttachmentBuilder(buf, { name: filename });
    const caption = content.text || content.media.caption;
    await (channel as TextChannel).send({
      content: caption ?? undefined,
      files: [attachment],
      ...replyOpts,
    });
    return;
  }
}

export async function initDiscord(): Promise<void> {
  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] conectado como ${c.user.tag} (${c.user.id})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
      const process = await shouldProcess(message);
      if (!process) return;

      const normalized = await normalizeMessage(message);
      onInboundMessage?.(normalized);
      console.log(`[discord] inbound de ${normalized.userName} em ${message.guild?.name ?? 'DM'}: "${normalized.content.text?.slice(0, 40)}"`);
    } catch (err) {
      console.error('[discord] normalize error:', (err as Error).message);
    }
  });

  await client.login(config.discordToken);
}

export async function destroyClient(): Promise<void> {
  await client.destroy();
}
