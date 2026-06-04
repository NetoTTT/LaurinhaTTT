import { config } from './config';
import { createRedisClients, subscribeOutbound, closeRedis } from './bus/redis';
import { initDiscord, destroyClient } from './discord/client';

async function main(): Promise<void> {
  if (!config.discordToken) {
    console.error('[discord-adapter] DISCORD_BOT_TOKEN não definido. Configure no ecosystem.config.js');
    process.exit(1);
  }

  createRedisClients();
  subscribeOutbound();

  await initDiscord();

  console.log('[discord-adapter] pronto');

  const shutdown = async (): Promise<void> => {
    await destroyClient();
    closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[discord-adapter] fatal', err);
  process.exit(1);
});
