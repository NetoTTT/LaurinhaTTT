import type { FastifyInstance } from 'fastify';
import { getStatus, logout } from '../whatsapp/client';

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'whatsapp-adapter' });
  });

  // Estado da conexão + QR code (consumido pelo dashboard)
  app.get('/status', async (_req, reply) => {
    return reply.send(getStatus());
  });

  // Logout / desconectar a sessão atual
  app.post('/logout', async (_req, reply) => {
    await logout();
    return reply.send({ ok: true });
  });
}
