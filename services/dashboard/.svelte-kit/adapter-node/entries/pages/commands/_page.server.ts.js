import { p as private_env } from "../../../chunks/shared-server.js";
import { fail } from "@sveltejs/kit";
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
export {
  actions,
  load
};
