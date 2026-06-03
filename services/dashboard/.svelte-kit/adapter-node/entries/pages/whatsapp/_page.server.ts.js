import { p as private_env } from "../../../chunks/shared-server.js";
import { fail } from "@sveltejs/kit";
const WA_ADAPTER_URL = private_env.WA_ADAPTER_URL ?? "http://whatsapp-adapter:3322";
const load = async () => {
  try {
    const res = await fetch(`${WA_ADAPTER_URL}/status`, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) {
      return { state: "unknown", qrBase64: null, pushName: null, number: null, error: "whatsapp-adapter indisponível" };
    }
    const status = await res.json();
    return { ...status, error: null };
  } catch {
    return { state: "unknown", qrBase64: null, pushName: null, number: null, error: "Não foi possível conectar ao whatsapp-adapter" };
  }
};
const actions = {
  logout: async () => {
    try {
      const res = await fetch(`${WA_ADAPTER_URL}/logout`, { method: "POST" });
      if (!res.ok) return fail(500, { error: "Falha ao desconectar" });
      return { success: true };
    } catch {
      return fail(500, { error: "whatsapp-adapter indisponível" });
    }
  }
};
export {
  actions,
  load
};
