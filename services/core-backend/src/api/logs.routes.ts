import type { FastifyInstance } from 'fastify';
import { execFile } from 'child_process';

const ALLOWED_SERVICES = ['core-backend', 'whatsapp-adapter', 'dashboard'];

export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { service: string } }>('/api/logs/:service', (request, reply) => {
    const { service } = request.params;

    if (!ALLOWED_SERVICES.includes(service)) {
      return reply.status(400).send({ error: 'Serviço inválido' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const send = (line: string): void => {
      reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
    };

    const child = execFile('pm2', ['logs', service, '--nostream', '--lines', '50']);

    child.stdout?.on('data', (data: Buffer) => {
      String(data).split('\n').filter(Boolean).forEach(send);
    });
    child.stderr?.on('data', (data: Buffer) => {
      String(data).split('\n').filter(Boolean).forEach(send);
    });

    request.raw.on('close', () => child.kill());

    return reply;
  });
}