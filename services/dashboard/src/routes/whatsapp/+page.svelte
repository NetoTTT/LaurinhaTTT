<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { onMount, onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  export let data: PageData;
  export let form: ActionData;

  $: isReady = data.state === 'ready';
  $: showQr = data.state === 'qr' && data.qrBase64;

  const labels: Record<string, string> = {
    initializing: 'Inicializando…',
    qr: 'Aguardando leitura do QR',
    authenticated: 'Autenticado, carregando…',
    ready: 'Conectado',
    disconnected: 'Desconectado',
    unknown: 'Indisponível',
  };

  const dotClass: Record<string, string> = {
    ready: 'bg-emerald-400',
    authenticated: 'bg-yellow-400 animate-pulse',
    qr: 'bg-blue-400 animate-pulse',
    initializing: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-red-500',
    unknown: 'bg-gray-500',
  };

  // Auto-refresh enquanto não está pronto (pega QR novo / mudança de estado)
  let interval: ReturnType<typeof setInterval>;
  onMount(() => {
    interval = setInterval(() => { if (!isReady) invalidateAll(); }, 8000);
  });
  onDestroy(() => clearInterval(interval));
</script>

<div class="p-6 max-w-2xl">
  <h1 class="text-lg font-semibold mb-0.5">WhatsApp</h1>
  <p class="text-gray-500 text-sm mb-6">whatsapp-web.js com Chromium headless</p>

  <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2.5">
        <span class="w-2.5 h-2.5 rounded-full {dotClass[data.state] ?? 'bg-gray-500'}"></span>
        <span class="font-medium">{labels[data.state] ?? data.state}</span>
      </div>
      {#if isReady}
        <form method="POST" action="?/logout" use:enhance>
          <button type="submit" class="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
            Desconectar
          </button>
        </form>
      {/if}
    </div>

    {#if isReady}
      <div class="space-y-1 text-sm">
        <div class="flex gap-2"><span class="text-gray-500 w-28">Nome:</span><span>{data.pushName ?? '—'}</span></div>
        <div class="flex gap-2"><span class="text-gray-500 w-28">Número:</span><span class="font-mono text-xs">{data.number ?? '—'}</span></div>
      </div>
    {/if}

    {#if data.error}
      <div class="mt-2 text-xs text-red-400">{data.error}</div>
    {/if}
    {#if form?.error}
      <div class="mt-2 text-xs text-red-400">{form.error}</div>
    {/if}
  </div>

  {#if !isReady}
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 class="text-sm font-semibold text-gray-300 mb-4">Escanear QR Code</h2>
      {#if showQr}
        <div class="flex justify-center">
          <img src={data.qrBase64} alt="QR Code WhatsApp" class="w-72 h-72 rounded-lg bg-white p-2" />
        </div>
        <p class="text-xs text-gray-500 text-center mt-3">
          WhatsApp → Aparelhos conectados → Conectar aparelho
        </p>
        <p class="text-xs text-gray-600 text-center mt-1">Atualiza automaticamente a cada 8s</p>
      {:else}
        <div class="text-gray-600 text-sm text-center py-10">
          {data.state === 'initializing' ? 'Inicializando o cliente… aguarde o QR aparecer' : 'Aguardando QR Code…'}
        </div>
      {/if}
    </div>
  {/if}
</div>
