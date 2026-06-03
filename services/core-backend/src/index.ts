import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { createRedisClients, subscribeInbound, closeRedis } from './bus/redis';
import { initDatabase, pool } from './db/database';
import { getEnabledCommandsMap } from './db/commands.repository';
import { reloadCommandsCache } from './handlers/text.handler';
import { reloadOwnerCommandsCache } from './handlers/owner.handler';
import { commandsRoutes } from './api/commands.routes';
import { eventsRoutes } from './api/events.routes';
import { logsRoutes } from './api/logs.routes';
import { ownerRoutes } from './api/owner.routes';

async function main(): Promise<void> {
  // Infra
  createRedisClients();
  subscribeInbound();

  try {
    await initDatabase();
    reloadCommandsCache(await getEnabledCommandsMap());
    reloadOwnerCommandsCache(await getEnabledCommandsMap());
  } catch (err) {
    console.warn('[db] unavailable, running with empty commands cache:', (err as Error).message);
  }

  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: true });
  await app.register(commandsRoutes);
  await app.register(eventsRoutes);
  await app.register(logsRoutes);
  await app.register(ownerRoutes);

  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'core-backend' });
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[core-backend] listening on port ${config.port}`);

  const shutdown = async (): Promise<void> => {
    await app.close();
    closeRedis();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[core-backend] fatal', err);
  process.exit(1);
});
