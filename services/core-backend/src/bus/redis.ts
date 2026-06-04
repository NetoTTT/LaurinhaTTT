import Redis from 'ioredis';
import { BUS_TOPICS, type PlatformMessage, type PlatformResponse } from '@laurinha/shared-types';
import { config } from '../config';
import { routeMessage } from '../router/command.router';
import { initMessageTracker, trackAIMessage } from '../ai/message-tracker';

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

  initMessageTracker(tracker);
}

export async function publishOutbound(response: PlatformResponse): Promise<void> {
  await publisher.publish(BUS_TOPICS.MESSAGE_OUTBOUND, JSON.stringify(response));

  // Rastreia a mensagem da IA para permitir auto-reply sem prefixo
  if (response.replyTo) {
    // Registra que a IA respondeu a essa mensagem para evitar loops
    // Quando essa resposta voltar, será detectada como uma resposta recente da IA
    console.log(`[tracker] scheduled tracking for reply to ${response.replyTo}`);

    // Importar aqui para evitar circular dependency
    const { trackSentMessage } = await import('../router/command.router');
    trackSentMessage(response.replyTo);
  }
}

export function subscribeInbound(): void {
  subscriber.subscribe(BUS_TOPICS.MESSAGE_INBOUND, (err) => {
    if (err) console.error('[redis:sub] subscribe error', err.message);
    else console.log(`[redis:sub] listening on ${BUS_TOPICS.MESSAGE_INBOUND}`);
  });

  subscriber.on('message', async (channel, raw) => {
    if (channel !== BUS_TOPICS.MESSAGE_INBOUND) return;

    let message: PlatformMessage;
    try {
      message = JSON.parse(raw) as PlatformMessage;
    } catch {
      console.error('[redis:sub] invalid JSON', raw);
      return;
    }

    console.log(`[core] routing ${message.platform} message from ${message.userName}`);

    try {
      const response = await routeMessage(message);
      if (response) await publishOutbound(response);
    } catch (err) {
      console.error('[core] routing error', (err as Error).message);
    }
  });
}

export function closeRedis(): void {
  publisher.quit();
  subscriber.quit();
  tracker.quit();
}
