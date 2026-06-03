import { F as getContext, a8 as store_get, y as ensure_array_like, j as attr, k as attr_class, z as escape_html, a5 as slot, ac as unsubscribe_stores } from "../../chunks/renderer.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let current;
    const nav = [
      { href: "/", label: "Overview", icon: "▦" },
      { href: "/whatsapp", label: "WhatsApp", icon: "◉" },
      { href: "/messages", label: "Mensagens", icon: "≋" },
      { href: "/commands", label: "Comandos", icon: "⌘" }
    ];
    current = store_get($$store_subs ??= {}, "$page", page).url.pathname;
    $$renderer2.push(`<div class="flex h-screen bg-gray-950 text-white overflow-hidden"><nav class="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0"><div class="px-4 py-5 border-b border-gray-800"><div class="text-emerald-400 font-bold text-sm tracking-wide">LAURINHA TTT</div> <div class="text-gray-600 text-xs mt-0.5">Dashboard v1</div></div> <ul class="flex-1 p-2 space-y-0.5"><!--[-->`);
    const each_array = ensure_array_like(nav);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<li><a${attr("href", item.href)}${attr_class(`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${current === item.href ? "bg-emerald-500/10 text-emerald-400 font-medium" : "text-gray-400 hover:text-white hover:bg-gray-800"}`)}><span class="text-base w-5 text-center leading-none">${escape_html(item.icon)}</span> ${escape_html(item.label)}</a></li>`);
    }
    $$renderer2.push(`<!--]--></ul> <div class="px-4 py-3 border-t border-gray-800 text-xs text-gray-700">© 2026 NetoTTT</div></nav> <main class="flex-1 overflow-auto"><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></main></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
