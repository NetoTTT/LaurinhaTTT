import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { BUS_TOPICS } from '@laurinha/shared-types';
import { config } from '../config';

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    reply.raw.write('data: {"type":"connected"}\n\n');

    const subscriber = new Redis(config.redisUrl);
    subscriber.subscribe(BUS_TOPICS.MESSAGE_INBOUND, BUS_TOPICS.MESSAGE_OUTBOUND);

    subscriber.on('message', (channel, raw) => {
      const direction = channel === BUS_TOPICS.MESSAGE_INBOUND ? 'inbound' : 'outbound';
      reply.raw.write(`data: ${JSON.stringify({ direction, message: JSON.parse(raw) })}\n\n`);
    });

    request.raw.on('close', () => { subscriber.quit(); });
  });
}
