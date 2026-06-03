import Redis from 'ioredis';

let redis: Redis | null = null;

const AI_MESSAGE_PREFIX = 'ai_msg:';
const EXPIRE_SECONDS = 86400; // 24 horas

export function initAIMessageTracker(redisClient: Redis): void {
  redis = redisClient;
}

export async function trackAIMessageSent(
  messageId: string,
  chatId: string,
  userId: string,
): Promise<void> {
  if (!redis) return;

  const key = `${AI_MESSAGE_PREFIX}whatsapp:${messageId}`;
  const data = JSON.stringify({ chatId, userId, createdAt: Date.now() });

  await redis.setex(key, EXPIRE_SECONDS, data);
  console.log(`[ai-tracker] tracked AI message: ${messageId}`);
}
