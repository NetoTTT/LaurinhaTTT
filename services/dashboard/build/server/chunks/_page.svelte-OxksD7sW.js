import { J as escape_html, G as ensure_array_like, n as attr, o as attr_class, p as bind_props } from './renderer-C244bsGb.js';
import '@sveltejs/kit/internal';
import './root-gwBkr4in.js';
import '@sveltejs/kit/internal/server';
import './state.svelte-T4ZLxLZd.js';

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    let form = $$props["form"];
    let editing = null;
    $$renderer2.push(`<div class="p-6 max-w-4xl"><div class="flex items-center justify-between mb-6"><div><h1 class="text-lg font-semibold">Comandos</h1> <p class="text-gray-500 text-sm">${escape_html(data.commands.length)} comando${escape_html(data.commands.length !== 1 ? "s" : "")} cadastrado${escape_html(data.commands.length !== 1 ? "s" : "")}</p></div> <button class="text-sm px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors">${escape_html("+ Novo comando")}</button></div> `);
    if (data.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">${escape_html(data.error)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (form?.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">${escape_html(form.error)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">`);
    if (data.commands.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="text-gray-600 text-sm text-center py-12">Nenhum comando cadastrado</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<table class="w-full text-sm"><thead><tr class="border-b border-gray-800 text-xs text-gray-500"><th class="text-left px-4 py-3 font-medium">Gatilho</th><th class="text-left px-4 py-3 font-medium">Resposta</th><th class="text-left px-4 py-3 font-medium w-20">Status</th><th class="px-4 py-3 w-28"></th></tr></thead><tbody><!--[-->`);
      const each_array = ensure_array_like(data.commands);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let cmd = each_array[$$index];
        $$renderer2.push(`<tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"><td class="px-4 py-3 font-mono text-emerald-300 text-xs">${escape_html(cmd.trigger)}</td><td class="px-4 py-3 text-gray-300">`);
        if (editing === cmd.id) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<form method="POST" action="?/update" class="flex gap-2"><input type="hidden" name="id"${attr("value", cmd.id)}/> <input name="response"${attr("value", cmd.response)} class="flex-1 bg-gray-800 border border-emerald-500/50 rounded px-2 py-1 text-xs focus:outline-none"/> <button type="submit" class="text-xs text-emerald-400 hover:text-emerald-300">✓</button> <button type="button" class="text-xs text-gray-500 hover:text-gray-400">✕</button></form>`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="text-xs text-gray-400 truncate block max-w-xs">${escape_html(cmd.response)}</span>`);
        }
        $$renderer2.push(`<!--]--></td><td class="px-4 py-3"><form method="POST" action="?/toggle"><input type="hidden" name="id"${attr("value", cmd.id)}/> <input type="hidden" name="enabled"${attr("value", cmd.enabled)}/> <button type="submit"${attr_class(`text-xs ${cmd.enabled ? "text-emerald-400" : "text-gray-600"} hover:opacity-70 transition-opacity`)}>${escape_html(cmd.enabled ? "● Ativo" : "○ Inativo")}</button></form></td><td class="px-4 py-3"><div class="flex items-center justify-end gap-2"><button class="text-xs text-gray-500 hover:text-white transition-colors">Editar</button> <form method="POST" action="?/delete"><input type="hidden" name="id"${attr("value", cmd.id)}/> <button type="submit" class="text-xs text-gray-600 hover:text-red-400 transition-colors">Excluir</button></form></div></td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
    bind_props($$props, { data, form });
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-OxksD7sW.js.map
