import { y as ensure_array_like, k as attr_class, z as escape_html, a9 as stringify, l as bind_props } from "../../chunks/renderer.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    let selectedService = null;
    const dotColor = (s) => s === "ok" ? "bg-emerald-400" : s === "error" ? "bg-red-500" : "bg-yellow-400";
    const textColor = (s) => s === "ok" ? "text-emerald-400" : s === "error" ? "text-red-400" : "text-yellow-400";
    const icons = { "core-backend": "⚙", "whatsapp-adapter": "◉" };
    $$renderer2.push(`<div class="p-6 max-w-5xl"><h1 class="text-lg font-semibold mb-0.5">Overview</h1> <p class="text-gray-500 text-sm mb-6">Clique em um serviço para ver os logs em tempo real</p> <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"><!--[-->`);
    const each_array = ensure_array_like(data.services);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let svc = each_array[$$index];
      $$renderer2.push(`<button${attr_class(`bg-gray-900 border rounded-xl p-4 flex flex-col gap-2 text-left transition-colors cursor-pointer ${selectedService === svc.name ? "border-emerald-500/50 bg-emerald-500/5" : "border-gray-800 hover:border-gray-600"}`)}><div class="flex items-center justify-between"><div class="flex items-center gap-2 text-sm font-medium"><span class="text-gray-400">${escape_html(icons[svc.name] ?? "●")}</span> ${escape_html(svc.name)}</div> <span${attr_class(`w-2.5 h-2.5 rounded-full ${stringify(dotColor(svc.status))} animate-pulse`)}></span></div> <div${attr_class(`text-xs font-mono ${stringify(textColor(svc.status))}`)}>${escape_html(svc.status.toUpperCase())}</div> `);
      if (svc.latency) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="text-xs text-gray-600">${escape_html(svc.latency)}ms</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div class="text-xs text-gray-700 mt-1">${escape_html(selectedService === svc.name ? "▲ fechar logs" : "▼ ver logs")}</div></button>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="bg-gray-900 border border-gray-800 rounded-xl p-4"><h2 class="text-sm font-semibold mb-3 text-gray-300">Resumo da arquitetura</h2> <div class="font-mono text-xs text-gray-500 space-y-1"><div>WhatsApp ↔ whatsapp-web.js (Chromium)</div> <div class="pl-4">↕ dentro do whatsapp-adapter :3322</div> <div class="pl-4">↕ Redis pub/sub</div> <div>core-backend :3321</div> <div class="pl-4">↕</div> <div>PostgreSQL :5433 · Redis :6379</div></div></div></div>`);
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
