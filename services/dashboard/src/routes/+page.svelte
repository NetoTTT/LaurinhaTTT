<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  let selectedService: string | null = null;
  let logLines: string[] = [];
  let logEs: EventSource | null = null;
  let logContainer: HTMLDivElement;

  const dotColor = (s: string) =>
    s === 'ok' ? 'bg-emerald-400' : s === 'error' ? 'bg-red-500' : 'bg-yellow-400';

  const textColor = (s: string) =>
    s === 'ok' ? 'text-emerald-400' : s === 'error' ? 'text-red-400' : 'text-yellow-400';

  const icons: Record<string, string> = {
    'core-backend':     '⚙',
    'whatsapp-adapter': '◉',
  };

  function openLogs(name: string) {
    if (logEs) logEs.close();
    logLines = [];
    selectedService = name;

    logEs = new EventSource(`/api/logs/${name}`);
    logEs.onmessage = (e) => {
      const { line } = JSON.parse(e.data);
      logLines = [...logLines.slice(-300), line];
      setTimeout(() => logContainer?.scrollTo(0, logContainer.scrollHeight), 0);
    };
    logEs.onerror = () => {
      logLines = [...logLines, '--- conexão encerrada ---'];
    };
  }

  function closeLogs() {
    logEs?.close();
    logEs = null;
    selectedService = null;
    logLines = [];
  }
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-lg font-semibold mb-0.5">Overview</h1>
  <p class="text-gray-500 text-sm mb-6">Clique em um serviço para ver os logs em tempo real</p>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {#each data.services as svc}
      <button
        on:click={() => selectedService === svc.name ? closeLogs() : openLogs(svc.name)}
        class="bg-gray-900 border rounded-xl p-4 flex flex-col gap-2 text-left transition-colors cursor-pointer
          {selectedService === svc.name
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-gray-800 hover:border-gray-600'}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-medium">
            <span class="text-gray-400">{icons[svc.name] ?? '●'}</span>
            {svc.name}
          </div>
          <span class="w-2.5 h-2.5 rounded-full {dotColor(svc.status)} animate-pulse"></span>
        </div>
        <div class="text-xs font-mono {textColor(svc.status)}">{svc.status.toUpperCase()}</div>
        {#if svc.latency}
          <div class="text-xs text-gray-600">{svc.latency}ms</div>
        {/if}
        <div class="text-xs text-gray-700 mt-1">
          {selectedService === svc.name ? '▲ fechar logs' : '▼ ver logs'}
        </div>
      </button>
    {/each}
  </div>

  <!-- Log panel -->
  {#if selectedService}
    <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
      <div class="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span class="text-xs font-mono text-emerald-400">logs: {selectedService}</span>
        <button on:click={closeLogs} class="text-xs text-gray-500 hover:text-white transition-colors">✕ fechar</button>
      </div>
      <div bind:this={logContainer} class="h-72 overflow-auto p-3 font-mono text-xs text-gray-300 space-y-0.5">
        {#if logLines.length === 0}
          <div class="text-gray-600">Aguardando logs…</div>
        {/if}
        {#each logLines as line}
          <div class="leading-5 whitespace-pre-wrap break-all
            {line.includes('error') || line.includes('Error') || line.includes('ERROR') ? 'text-red-400' :
             line.includes('warn') || line.includes('WARN') ? 'text-yellow-400' : ''}">
            {line}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
    <h2 class="text-sm font-semibold mb-3 text-gray-300">Resumo da arquitetura</h2>
    <div class="font-mono text-xs text-gray-500 space-y-1">
      <div>WhatsApp ↔ whatsapp-web.js (Chromium)</div>
      <div class="pl-4">↕ dentro do whatsapp-adapter :3322</div>
      <div class="pl-4">↕ Redis pub/sub</div>
      <div>core-backend :3321</div>
      <div class="pl-4">↕</div>
      <div>PostgreSQL :5433 · Redis :6379</div>
    </div>
  </div>
</div>
