import Fastify from 'fastify';
import { config } from './config';
import { apiRoutes } from './api/routes';
import { createRedisClients, subscribeOutbound, closeRedis } from './bus/redis';
import { initWhatsApp, destroyClient } from './whatsapp/client';

async function main(): Promise<void> {
  createRedisClients();
  subscribeOutbound();

  const app = Fastify({ logger: { level: 'warn' } });
  await app.register(apiRoutes);
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[whatsapp-adapter] HTTP listening on port ${config.port}`);

  // Inicializa o whatsapp-web.js (gera QR, conecta, escuta mensagens)
  await initWhatsApp();

  const shutdown = async (): Promise<void> => {
    await app.close();
    await destroyClient();
    closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[whatsapp-adapter] fatal', err);
  process.exit(1);
});
