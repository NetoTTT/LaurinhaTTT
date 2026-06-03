import { k as attr_class, a9 as stringify, z as escape_html, j as attr, l as bind_props } from "../../../chunks/renderer.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let isReady, showQr;
    let data = $$props["data"];
    let form = $$props["form"];
    const labels = {
      initializing: "Inicializando…",
      qr: "Aguardando leitura do QR",
      authenticated: "Autenticado, carregando…",
      ready: "Conectado",
      disconnected: "Desconectado",
      unknown: "Indisponível"
    };
    const dotClass = {
      ready: "bg-emerald-400",
      authenticated: "bg-yellow-400 animate-pulse",
      qr: "bg-blue-400 animate-pulse",
      initializing: "bg-yellow-400 animate-pulse",
      disconnected: "bg-red-500",
      unknown: "bg-gray-500"
    };
    let interval;
    onDestroy(() => clearInterval(interval));
    isReady = data.state === "ready";
    showQr = data.state === "qr" && data.qrBase64;
    $$renderer2.push(`<div class="p-6 max-w-2xl"><h1 class="text-lg font-semibold mb-0.5">WhatsApp</h1> <p class="text-gray-500 text-sm mb-6">whatsapp-web.js com Chromium headless</p> <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5"><div class="flex items-center justify-between mb-4"><div class="flex items-center gap-2.5"><span${attr_class(`w-2.5 h-2.5 rounded-full ${stringify(dotClass[data.state] ?? "bg-gray-500")}`)}></span> <span class="font-medium">${escape_html(labels[data.state] ?? data.state)}</span></div> `);
    if (isReady) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<form method="POST" action="?/logout"><button type="submit" class="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Desconectar</button></form>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (isReady) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="space-y-1 text-sm"><div class="flex gap-2"><span class="text-gray-500 w-28">Nome:</span><span>${escape_html(data.pushName ?? "—")}</span></div> <div class="flex gap-2"><span class="text-gray-500 w-28">Número:</span><span class="font-mono text-xs">${escape_html(data.number ?? "—")}</span></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (data.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="mt-2 text-xs text-red-400">${escape_html(data.error)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (form?.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="mt-2 text-xs text-red-400">${escape_html(form.error)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (!isReady) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="bg-gray-900 border border-gray-800 rounded-xl p-5"><h2 class="text-sm font-semibold text-gray-300 mb-4">Escanear QR Code</h2> `);
      if (showQr) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="flex justify-center"><img${attr("src", data.qrBase64)} alt="QR Code WhatsApp" class="w-72 h-72 rounded-lg bg-white p-2"/></div> <p class="text-xs text-gray-500 text-center mt-3">WhatsApp → Aparelhos conectados → Conectar aparelho</p> <p class="text-xs text-gray-600 text-center mt-1">Atualiza automaticamente a cada 8s</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="text-gray-600 text-sm text-center py-10">${escape_html(data.state === "initializing" ? "Inicializando o cliente… aguarde o QR aparecer" : "Aguardando QR Code…")}</div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { data, form });
  });
}
export {
  _page as default
};
