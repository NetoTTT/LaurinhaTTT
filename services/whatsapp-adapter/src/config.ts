import 'dotenv/config';

export const config = {
  port: parseInt(process.env.WA_ADAPTER_PORT ?? '3322'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  sessionPath: process.env.WA_SESSION_PATH ?? '.wa-session',
  chromiumPath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
};
