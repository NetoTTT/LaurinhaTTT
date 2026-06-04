import 'dotenv/config';

export const config = {
  discordToken: process.env.DISCORD_BOT_TOKEN ?? '',
  ownerDiscordId: process.env.DISCORD_OWNER_ID ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  port: parseInt(process.env.DISCORD_ADAPTER_PORT ?? '3324'),
};
