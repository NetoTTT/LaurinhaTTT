export type Platform = 'whatsapp' | 'discord' | 'telegram';

export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document';

export interface MediaContent {
  url?: string;
  base64?: string;
  mimetype: string;
  caption?: string;
  filename?: string;
}

export interface PlatformMessage {
  id: string;
  platform: Platform;
  chatId: string;
  userId: string;
  userName: string;
  isGroup: boolean;
  groupId?: string;
  content: {
    type: ContentType;
    text?: string;
    media?: MediaContent;
  };
  replyTo?: string;
  quotedMessage?: {
    id: string;
    type: ContentType;
    text?: string;
    media?: MediaContent;
  };
  timestamp: number;
  raw?: unknown;
}

export interface PlatformResponse {
  chatId: string;
  platform: Platform;
  content: {
    type: ContentType;
    text?: string;
    media?: MediaContent;
  };
  replyTo?: string;
}
