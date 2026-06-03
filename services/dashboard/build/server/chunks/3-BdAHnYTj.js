import { p as private_env } from './shared-server-C3WdcJCQ.js';
import { fail } from '@sveltejs/kit';

const base = private_env.CORE_BACKEND_URL ?? "http://localhost:3321";
const load = async () => {
  try {
    const res = await fetch(`${base}/api/commands`);
    if (!res.ok) return { commands: [], error: "core-backend indisponível" };
    return { commands: await res.json(), error: null };
  } catch {
    return { commands: [], error: "Não foi possível conectar ao core-backend" };
  }
};
const actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const trigger = data.get("trigger");
    const response = data.get("response");
    if (!trigger || !response) return fail(400, { error: "Preencha todos os campos" });
    const res = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger, response })
    });
    if (!res.ok) return fail(500, { error: "Erro ao criar comando" });
    return { success: true };
  },
  update: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id");
    const response = data.get("response");
    if (!id || !response) return fail(400, { error: "Dados inválidos" });
    await fetch(`${base}/api/commands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response })
    });
    return { success: true };
  },
  toggle: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id");
    const enabled = data.get("enabled") === "true";
    await fetch(`${base}/api/commands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled })
    });
    return { success: true };
  },
  delete: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id");
    await fetch(`${base}/api/commands/${id}`, { method: "DELETE" });
    return { success: true };
  }
};

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  actions: actions,
  load: load
});

const index = 3;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-OxksD7sW.js')).default;
const server_id = "src/routes/commands/+page.server.ts";
const imports = ["_app/immutable/nodes/3.CsrVf1my.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BOapl1dN.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/DfjMaT63.js","_app/immutable/chunks/oHFLFQMb.js","_app/immutable/chunks/TUcuHu3_.js","_app/immutable/chunks/7YYcctaQ.js","_app/immutable/chunks/D0lUaFnm.js","_app/immutable/chunks/CTwQVCye.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, _page_server_ts as server, server_id, stylesheets };
//# sourceMappingURL=3-BdAHnYTj.js.map
