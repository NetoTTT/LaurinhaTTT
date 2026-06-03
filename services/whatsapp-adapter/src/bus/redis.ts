import Redis from 'ioredis';
import { BUS_TOPICS, type PlatformMessage, type PlatformResponse } from '@laurinha/shared-types';
import { config } from '../config';
import { sendResponse, setInboundHandler } from '../whatsapp/client';
import { initAIMessageTracker } from '../tracker/ai-messages';

let publisher: Redis;
let subscriber: Redis;
let tracker: Redis;

export function createRedisClients(): void {
  publisher = new Redis(config.redisUrl);
  subscriber = new Redis(config.redisUrl);
  tracker = new Redis(config.redisUrl);

  publisher.on('error', (err) => console.error('[redis:pub]', err.message));
  subscriber.on('error', (err) => console.error('[redis:sub]', err.message));
  tracker.on('error', (err) => console.error('[redis:tracker]', err.message));

  initAIMessageTracker(tracker);

  // Toda mensagem recebida do WhatsApp é publicada no barramento
  setInboundHandler((message: PlatformMessage) => {
    publisher.publish(BUS_TOPICS.MESSAGE_INBOUND, JSON.stringify(message)).catch((e) =>
      console.error('[redis:pub] inbound error', e.message),
    );
  });
}

export function subscribeOutbound(): void {
  subscriber.subscribe(BUS_TOPICS.MESSAGE_OUTBOUND, (err) => {
    if (err) console.error('[redis:sub] subscribe error', err.message);
    else console.log(`[redis:sub] listening on ${BUS_TOPICS.MESSAGE_OUTBOUND}`);
  });

  subscriber.on('message', async (channel, raw) => {
    if (channel !== BUS_TOPICS.MESSAGE_OUTBOUND) return;

    let response: PlatformResponse;
    try {
      response = JSON.parse(raw) as PlatformResponse;
    } catch {
      console.error('[redis:sub] invalid JSON', raw);
      return;
    }

    if (response.platform !== 'whatsapp') return;

    try {
      await sendResponse(response);
    } catch (err) {
      console.error('[wa:send] error', (err as Error).message);
    }
  });
}

export function closeRedis(): void {
  publisher.quit();
  subscriber.quit();
  tracker.quit();
}
