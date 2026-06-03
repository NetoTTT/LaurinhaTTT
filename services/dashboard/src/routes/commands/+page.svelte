<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  export let data: PageData;
  export let form: ActionData;

  let editing: number | null = null;
  let showForm = false;
</script>

<div class="p-6 max-w-4xl">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-lg font-semibold">Comandos</h1>
      <p class="text-gray-500 text-sm">{data.commands.length} comando{data.commands.length !== 1 ? 's' : ''} cadastrado{data.commands.length !== 1 ? 's' : ''}</p>
    </div>
    <button
      on:click={() => (showForm = !showForm)}
      class="text-sm px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
    >
      {showForm ? 'Cancelar' : '+ Novo comando'}
    </button>
  </div>

  {#if data.error}
    <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{data.error}</div>
  {/if}

  {#if form?.error}
    <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{form.error}</div>
  {/if}

  <!-- New command form -->
  {#if showForm}
    <form
      method="POST"
      action="?/create"
      use:enhance={() => { return ({ update }) => { update(); showForm = false; }; }}
      class="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
    >
      <h2 class="text-sm font-semibold text-gray-300">Novo comando</h2>
      <div class="flex gap-3">
        <div class="flex-none w-40">
          <label for="new-trigger" class="block text-xs text-gray-500 mb-1">Gatilho</label>
          <input
            id="new-trigger"
            name="trigger"
            placeholder="!exemplo"
            required
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div class="flex-1">
          <label for="new-response" class="block text-xs text-gray-500 mb-1">Resposta</label>
          <input
            id="new-response"
            name="response"
            placeholder="Texto da resposta..."
            required
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div class="flex items-end">
          <button
            type="submit"
            class="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium transition-colors"
          >
            Criar
          </button>
        </div>
      </div>
    </form>
  {/if}

  <!-- Commands table -->
  <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
    {#if data.commands.length === 0}
      <div class="text-gray-600 text-sm text-center py-12">Nenhum comando cadastrado</div>
    {:else}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-800 text-xs text-gray-500">
            <th class="text-left px-4 py-3 font-medium">Gatilho</th>
            <th class="text-left px-4 py-3 font-medium">Resposta</th>
            <th class="text-left px-4 py-3 font-medium w-20">Status</th>
            <th class="px-4 py-3 w-28"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.commands as cmd}
            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
              <td class="px-4 py-3 font-mono text-emerald-300 text-xs">{cmd.trigger}</td>
              <td class="px-4 py-3 text-gray-300">
                {#if editing === cmd.id}
                  <form
                    method="POST"
                    action="?/update"
                    use:enhance={() => { return ({ update }) => { update(); editing = null; }; }}
                    class="flex gap-2"
                  >
                    <input type="hidden" name="id" value={cmd.id} />
                    <input
                      name="response"
                      value={cmd.response}
                      class="flex-1 bg-gray-800 border border-emerald-500/50 rounded px-2 py-1 text-xs focus:outline-none"
                    />
                    <button type="submit" class="text-xs text-emerald-400 hover:text-emerald-300">✓</button>
                    <button type="button" on:click={() => (editing = null)} class="text-xs text-gray-500 hover:text-gray-400">✕</button>
                  </form>
                {:else}
                  <span class="text-xs text-gray-400 truncate block max-w-xs">{cmd.response}</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="id" value={cmd.id} />
                  <input type="hidden" name="enabled" value={cmd.enabled} />
                  <button type="submit" class="text-xs {cmd.enabled ? 'text-emerald-400' : 'text-gray-600'} hover:opacity-70 transition-opacity">
                    {cmd.enabled ? '● Ativo' : '○ Inativo'}
                  </button>
                </form>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-2">
                  <button
                    on:click={() => (editing = editing === cmd.id ? null : cmd.id)}
                    class="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    Editar
                  </button>
                  <form method="POST" action="?/delete" use:enhance>
                    <input type="hidden" name="id" value={cmd.id} />
                    <button
                      type="submit"
                      class="text-xs text-gray-600 hover:text-red-400 transition-colors"
                      on:click|preventDefault={(e) => { if (confirm(`Excluir "${cmd.trigger}"?`)) (e.target as HTMLFormElement).closest('form')?.submit(); }}
                    >
                      Excluir
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
