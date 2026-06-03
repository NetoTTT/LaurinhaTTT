import { p as private_env } from './shared-server-C3WdcJCQ.js';

const ALLOWED = ["core-backend", "whatsapp-adapter", "evolution", "postgres", "redis", "dashboard"];
const GET = async ({ params }) => {
  const { service } = params;
  if (!ALLOWED.includes(service)) {
    return new Response("Serviço inválido", { status: 400 });
  }
  const coreUrl = private_env.CORE_BACKEND_URL ?? "http://localhost:3321";
  const upstream = await fetch(`${coreUrl}/api/logs/${service}`, {
    headers: { Accept: "text/event-stream" }
  });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
};

export { GET };
//# sourceMappingURL=_server.ts-CKuaERFp.js.map
