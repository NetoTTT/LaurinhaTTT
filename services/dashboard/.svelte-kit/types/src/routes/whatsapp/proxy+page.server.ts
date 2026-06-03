// @ts-nocheck
import type { PageServerLoad, Actions } from './$types';
import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';

const WA_ADAPTER_URL = (env as Record<string, string>).WA_ADAPTER_URL ?? 'http://whatsapp-adapter:3322';

export const load = async () => {
  try {
    const res = await fetch(`${WA_ADAPTER_URL}/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { state: 'unknown', qrBase64: null, pushName: null, number: null, error: 'whatsapp-adapter indisponível' };
    }
    const status = await res.json();
    return { ...status, error: null };
  } catch {
    return { state: 'unknown', qrBase64: null, pushName: null, number: null, error: 'Não foi possível conectar ao whatsapp-adapter' };
  }
};

export const actions = {
  logout: async () => {
    try {
      const res = await fetch(`${WA_ADAPTER_URL}/logout`, { method: 'POST' });
      if (!res.ok) return fail(500, { error: 'Falha ao desconectar' });
      return { success: true };
    } catch {
      return fail(500, { error: 'whatsapp-adapter indisponível' });
    }
  },
};
;null as any as PageServerLoad;;null as any as Actions;