import { p as private_env } from './shared-server-C3WdcJCQ.js';

const { CORE_BACKEND_URL, WA_ADAPTER_URL } = private_env;
async function checkService(name, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3e3) });
    return { name, url, status: res.ok ? "ok" : "error", latency: Date.now() - start };
  } catch {
    return { name, url, status: "error" };
  }
}
const load = async () => {
  const checks = await Promise.all([
    checkService("core-backend", `${CORE_BACKEND_URL ?? "http://localhost:3321"}/health`),
    checkService("whatsapp-adapter", `${WA_ADAPTER_URL ?? "http://localhost:3322"}/health`)
  ]);
  return { services: checks };
};

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 2;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-5SYoUJWy.js')).default;
const server_id = "src/routes/+page.server.ts";
const imports = ["_app/immutable/nodes/2.DLaEKGVV.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BOapl1dN.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/DfjMaT63.js","_app/immutable/chunks/C8jUpsqL.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js","_app/immutable/chunks/D0lUaFnm.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, _page_server_ts as server, server_id, stylesheets };
//# sourceMappingURL=2-D6uIhzPH.js.map
