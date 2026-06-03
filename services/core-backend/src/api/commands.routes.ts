import type { FastifyInstance } from 'fastify';
import {
  getAllCommands,
  createCommand,
  updateCommand,
  deleteCommand,
  getEnabledCommandsMap,
} from '../db/commands.repository';
import { reloadCommandsCache } from '../handlers/text.handler';

async function refreshCache(): Promise<void> {
  reloadCommandsCache(await getEnabledCommandsMap());
}

export async function commandsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/commands', async (_req, reply) => {
    return reply.send(await getAllCommands());
  });

  app.post<{ Body: { trigger: string; response: string } }>('/api/commands', async (req, reply) => {
    const { trigger, response } = req.body;
    if (!trigger || !response) return reply.status(400).send({ error: 'trigger and response are required' });
    const command = await createCommand(trigger, response);
    await refreshCache();
    return reply.status(201).send(command);
  });

  app.put<{ Params: { id: string }; Body: { response?: string; enabled?: boolean } }>(
    '/api/commands/:id',
    async (req, reply) => {
      const id = parseInt(req.params.id);
      const command = await updateCommand(id, req.body);
      await refreshCache();
      return reply.send(command);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/commands/:id', async (req, reply) => {
    await deleteCommand(parseInt(req.params.id));
    await refreshCache();
    return reply.status(204).send();
  });
}
