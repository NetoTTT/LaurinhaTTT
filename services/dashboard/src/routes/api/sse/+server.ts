import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import Redis from 'ioredis';

const REDIS_URL = (env as Record<string, string>).REDIS_URL ?? 'redis://localhost:6379';

export const GET: RequestHandler = () => {
  let subscriber: Redis;

  const stream = new ReadableStream({
    start(controller) {
      subscriber = new Redis(REDIS_URL);

      const send = (data: unknown): void => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      subscriber.subscribe('platform.message.inbound', 'platform.message.outbound', (err) => {
        if (err) send({ type: 'error', message: err.message });
        else send({ type: 'connected' });
      });

      subscriber.on('message', (channel, raw) => {
        const direction = channel.includes('inbound') ? 'inbound' : 'outbound';
        try {
          send({ type: 'message', direction, message: JSON.parse(raw) });
        } catch {
          /* ignore malformed messages */
        }
      });

      subscriber.on('error', (err) => {
        send({ type: 'error', message: err.message });
      });
    },
    cancel() {
      subscriber?.quit();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
