import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

const AI_MESSAGE_PREFIX = 'ai_msg:';
const EXPIRE_SECONDS = 86400; // 24 horas

export function initMessageTracker(redisClient: Redis): void {
  redis = redisClient;
}

export async function trackAIMessage(
  platform: string,
  messageId: string,
  chatId: string,
  userId: string,
): Promise<void> {
  if (!redis) return;

  const key = `${AI_MESSAGE_PREFIX}${platform}:${messageId}`;
  const data = JSON.stringify({ chatId, userId, createdAt: Date.now() });

  await redis.setex(key, EXPIRE_SECONDS, data);
  console.log(`[ai-tracker] tracked message: ${messageId}`);
}

export async function isAIMessage(platform: string, messageId: string): Promise<boolean> {
  if (!redis) {
    console.log(`[ai-tracker] redis not initialized`);
    return false;
  }

  const key = `${AI_MESSAGE_PREFIX}${platform}:${messageId}`;
  const exists = await redis.exists(key);
  console.log(`[ai-tracker] checking ${key}: exists=${exists === 1}`);
  return exists === 1;
}

export async function getAIMessageInfo(
  platform: string,
  messageId: string,
): Promise<{ chatId: string; userId: string; createdAt: number } | null> {
  if (!redis) return null;

  const key = `${AI_MESSAGE_PREFIX}${platform}:${messageId}`;
  const data = await redis.get(key);

  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
