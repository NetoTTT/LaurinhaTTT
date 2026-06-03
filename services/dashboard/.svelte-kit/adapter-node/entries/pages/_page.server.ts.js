import { p as private_env } from "../../chunks/shared-server.js";
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
export {
  load
};
