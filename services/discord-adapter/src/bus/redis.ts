import Redis from 'ioredis';
import { BUS_TOPICS, type PlatformMessage, type PlatformResponse } from '@laurinha/shared-types';
import { config } from '../config';
import { sendResponse, setInboundHandler } from '../discord/client';

let publisher: Redis;
let subscriber: Redis;

export function createRedisClients(): void {
  publisher = new Redis(config.redisUrl);
  subscriber = new Redis(config.redisUrl);

  publisher.on('error', (err) => console.error('[redis:pub]', err.message));
  subscriber.on('error', (err) => console.error('[redis:sub]', err.message));

  setInboundHandler((message: PlatformMessage) => {
    publisher.publish(BUS_TOPICS.MESSAGE_INBOUND, JSON.stringify(message)).catch((e) =>
      console.error('[redis:pub] inbound error', e.message),
    );
  });
}

export function subscribeOutbound(): void {
  subscriber.subscribe(BUS_TOPICS.MESSAGE_OUTBOUND, (err) => {
    if (err) console.error('[redis:sub] subscribe error', err.message);
    else console.log(`[redis:sub] ouvindo ${BUS_TOPICS.MESSAGE_OUTBOUND}`);
  });

  subscriber.on('message', async (channel, raw) => {
    if (channel !== BUS_TOPICS.MESSAGE_OUTBOUND) return;

    let response: PlatformResponse;
    try {
      response = JSON.parse(raw) as PlatformResponse;
    } catch {
      console.error('[redis:sub] JSON inválido', raw);
      return;
    }

    // Só processa respostas para Discord
    if (response.platform !== 'discord') return;

    try {
      await sendResponse(response);
    } catch (err) {
      console.error('[discord:send] erro', (err as Error).message);
    }
  });
}

export function closeRedis(): void {
  publisher.quit();
  subscriber.quit();
}
