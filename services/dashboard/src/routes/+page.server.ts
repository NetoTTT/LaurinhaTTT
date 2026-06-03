import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

const { CORE_BACKEND_URL, WA_ADAPTER_URL } = env as Record<string, string>;

interface ServiceStatus {
  name: string;
  url: string;
  status: 'ok' | 'error' | 'unknown';
  latency?: number;
}

async function checkService(name: string, url: string): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { name, url, status: res.ok ? 'ok' : 'error', latency: Date.now() - start };
  } catch {
    return { name, url, status: 'error' };
  }
}

export const load: PageServerLoad = async () => {
  const checks = await Promise.all([
    checkService('core-backend', `${CORE_BACKEND_URL ?? 'http://localhost:3321'}/health`),
    checkService('whatsapp-adapter', `${WA_ADAPTER_URL ?? 'http://localhost:3322'}/health`),
  ]);

  return { services: checks };
};
