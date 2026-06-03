import { p as private_env } from './shared-server-C3WdcJCQ.js';
import { fail } from '@sveltejs/kit';

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

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  actions: actions,
  load: load
});

const index = 5;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-CU0LGBRD.js')).default;
const server_id = "src/routes/whatsapp/+page.server.ts";
const imports = ["_app/immutable/nodes/5.DAQPD24l.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BOapl1dN.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/7YYcctaQ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/IRPfbFQf.js","_app/immutable/chunks/BJ0iTM_n.js","_app/immutable/chunks/D0lUaFnm.js","_app/immutable/chunks/CTwQVCye.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, _page_server_ts as server, server_id, stylesheets };
//# sourceMappingURL=5-C-qpddZh.js.map
