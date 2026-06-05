import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  ActivityType,
  Events,
  type Message,
  type TextChannel,
  type DMChannel,
  type NewsChannel,
  type AnyThreadChannel,
} from 'discord.js';
import type { PlatformMessage, PlatformResponse } from '@laurinha/shared-types';
import { config } from '../config';

const STATUSES: Array<{ type: ActivityType; text: string }> = [
  { type: ActivityType.Watching,   text: 'o grupo explodir sozinho' },
  { type: ActivityType.Playing,    text: 'de inútil com estilo' },
  { type: ActivityType.Listening,  text: 'drama alheio atentamente' },
  { type: ActivityType.Playing,    text: 'de psicóloga sem formação' },
  { type: ActivityType.Watching,   text: 'meme e não mandando pra ninguém' },
  { type: ActivityType.Playing,    text: 'de fantasma no grupo' },
  { type: ActivityType.Listening,  text: 'alguém desabafar no pv' },
  { type: ActivityType.Watching,   text: 'vocês se autossabotarem' },
  { type: ActivityType.Playing,    text: 'ignorar mensagem com maestria' },
  { type: ActivityType.Listening,  text: 'confissão que não pedi pra ouvir' },
  { type: ActivityType.Playing,    text: 'de IA mas tô quase virando humana' },
  { type: ActivityType.Watching,   text: 'alguém apanhar e não intervindo' },
  { type: ActivityType.Playing,    text: 'de sabe-tudo sem saber nada' },
  { type: ActivityType.Listening,  text: 'silêncio de quem tá com raiva' },
  { type: ActivityType.Watching,   text: 'o caos se instalar devagar' },
  { type: ActivityType.Playing,    text: 'nas palavras sem compromisso' },
  { type: ActivityType.Listening,  text: 'áudio de 14 minutos no 2x' },
  { type: ActivityType.Watching,   text: 'todo mundo errar em câmera lenta' },
  { type: ActivityType.Playing,    text: 'de desentendida estrategicamente' },
  { type: ActivityType.Listening,  text: 'reclamação que não vai mudar nada' },
];

function setRandomStatus(): void {
  const s = STATUSES[Math.floor(Math.random() * STATUSES.length)];
  client.user?.setPresence({
    activities: [{ name: s.text, type: s.type }],
    status: 'online',
  });
  console.log(`[discord] status → ${ActivityType[s.type]} "${s.text}"`);
}

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
  const hasMention = message.mentions.has(client.user!.id);
  const isDM = !message.guild;

  let text = message.content
    .replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '')
    .trim();

  // Menção direta ou DM sem prefixo → equivale a !!la no WhatsApp
  if ((hasMention || isDM) && !text.startsWith('!!')) {
    return `!!la ${text || '👋'}`;
  }

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

    // Extrai só o tipo base (ignora "; codecs=opus" etc.)
    const baseMime = (content.media.mimetype ?? '').split(';')[0].trim();
    const ext = baseMime.split('/')[1] ?? 'bin';

    // Áudio: tenta voice message → anexo normal → texto puro
    if (content.type === 'audio') {
      const attachment = new AttachmentBuilder(buf, { name: 'audio.ogg' })
        .setDescription('mensagem de voz');

      // 1ª tentativa: voice message nativa (bolinha de voz)
      try {
        await (channel as TextChannel).send({
          files: [attachment],
          flags: [4096], // MessageFlags.IsVoiceMessage = 4096
        } as Parameters<TextChannel['send']>[0]);
        return;
      } catch { /* sem permissão para voice message */ }

      // 2ª tentativa: anexo de áudio normal (toca inline)
      try {
        await (channel as TextChannel).send({ files: [attachment], ...replyOpts });
        return;
      } catch { /* sem permissão para anexar arquivos */ }

      // 3ª tentativa: texto puro como fallback final
      const fallbackText = content.text;
      if (fallbackText) {
        for (const chunk of splitMessage(`🎙️ ${fallbackText}`)) {
          await (channel as TextChannel).send({ content: chunk, ...replyOpts });
        }
      }
      return;
    }

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
    setRandomStatus();
    setInterval(setRandomStatus, 60 * 60 * 1000);
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
