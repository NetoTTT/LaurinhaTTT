import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { routeMessage } from '../router/command.router';
import { publishOutbound } from '../bus/redis';
import type { PlatformMessage } from '@laurinha/shared-types';

export async function ownerRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/owner/execute - executa um comando como se fosse do dono
  // Body: { command: string, chatId: string }
  // Exemplo: POST /api/owner/execute -d '{"command": "!!ping", "chatId": "5511999999999@g.us"}'
  app.post<{ Body: { command: string; chatId: string } }>('/api/owner/execute', async (req, reply) => {
    const { command, chatId } = req.body;

    if (!command || !chatId) {
      return reply.status(400).send({ error: 'command and chatId are required' });
    }

    // Criar mensagem fake como se fosse do dono
    const message: PlatformMessage = {
      id: `owner-${Date.now()}`,
      platform: 'whatsapp',
      chatId,
      userId: config.ownerNumber,
      userName: 'Owner',
      isGroup: chatId.includes('@g.us'),
      groupId: chatId.includes('@g.us') ? chatId : undefined,
      content: {
        type: 'text',
        text: command,
      },
      timestamp: Date.now(),
    };

    try {
      const response = await routeMessage(message);

      if (response) {
        await publishOutbound(response);
        return reply.send({ status: 'executed', response });
      }

      return reply.send({ status: 'no_response' });
    } catch (err) {
      console.error('[owner-api] execute error', (err as Error).message);
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
