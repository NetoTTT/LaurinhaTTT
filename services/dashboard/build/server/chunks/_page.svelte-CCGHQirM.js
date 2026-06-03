import { o as attr_class, J as escape_html, n as attr, G as ensure_array_like, ap as stringify } from './renderer-C244bsGb.js';
import { o as onDestroy } from './index-server-DF0oPzXC.js';

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let feed = [];
    let es;
    let autoScroll = true;
    onDestroy(() => es?.close());
    const contentPreview = (m) => {
      if (m.content.text) return m.content.text.slice(0, 80) + (m.content.text.length > 80 ? "…" : "");
      return `[${m.content.type}]`;
    };
    const platformColor = {
      whatsapp: "text-emerald-400",
      discord: "text-indigo-400",
      telegram: "text-sky-400"
    };
    const dirBadge = (d) => d === "inbound" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    $$renderer2.push(`<div class="flex flex-col h-full"><div class="flex items-center justify-between px-6 py-4 border-b border-gray-800"><div><h1 class="text-lg font-semibold">Mensagens</h1> <p class="text-xs text-gray-500">Feed em tempo real via Redis</p></div> <div class="flex items-center gap-3"><div class="flex items-center gap-1.5 text-xs"><span${attr_class(`w-2 h-2 rounded-full ${"bg-red-500"}`)}></span> <span class="text-gray-500">${escape_html("Desconectado")}</span></div> <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer"><input type="checkbox"${attr("checked", autoScroll, true)} class="accent-emerald-500"/> Auto-scroll</label> <button class="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">Limpar</button></div></div> <div class="flex-1 overflow-auto p-4 space-y-1.5 font-mono text-xs">`);
    if (feed.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="text-gray-700 text-center py-16">Aguardando mensagens…</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(feed);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let entry = each_array[$$index];
      $$renderer2.push(`<div class="flex items-start gap-3 bg-gray-900 border border-gray-800/50 rounded-lg px-3 py-2 hover:border-gray-700 transition-colors"><span${attr_class(`px-1.5 py-0.5 rounded text-[10px] font-bold ${stringify(dirBadge(entry.direction))} shrink-0`)}>${escape_html(entry.direction === "inbound" ? "↓ IN" : "↑ OUT")}</span> <span${attr_class(`${stringify(platformColor[entry.message.platform] ?? "text-gray-400")} shrink-0 w-20`)}>${escape_html(entry.message.platform)}</span> <span class="text-gray-500 shrink-0 w-28 truncate">${escape_html(entry.message.userName)}</span> <span class="text-gray-300 flex-1 truncate">${escape_html(contentPreview(entry.message))}</span> <span class="text-gray-700 shrink-0">${escape_html(new Date(entry.receivedAt).toLocaleTimeString("pt-BR"))}</span></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="px-6 py-2 border-t border-gray-800 text-xs text-gray-700">${escape_html(feed.length)} mensagem${escape_html(feed.length !== 1 ? "s" : "")} · máx 200</div></div>`);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-CCGHQirM.js.map
