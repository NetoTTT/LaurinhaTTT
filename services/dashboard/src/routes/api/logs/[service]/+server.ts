import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ALLOWED = ['core-backend', 'whatsapp-adapter', 'evolution', 'postgres', 'redis', 'dashboard'];

export const GET: RequestHandler = async ({ params }) => {
  const { service } = params;
  if (!ALLOWED.includes(service)) {
    return new Response('Serviço inválido', { status: 400 });
  }

  const coreUrl = (env as Record<string, string>).CORE_BACKEND_URL ?? 'http://localhost:3321';

  // Faz proxy do SSE do core-backend para o browser
  const upstream = await fetch(`${coreUrl}/api/logs/${service}`, {
    headers: { Accept: 'text/event-stream' },
  });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
