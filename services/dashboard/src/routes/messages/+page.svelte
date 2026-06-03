<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PlatformMessage } from '@laurinha/shared-types';

  interface FeedEntry {
    id: string;
    direction: 'inbound' | 'outbound';
    message: PlatformMessage;
    receivedAt: number;
  }

  let feed: FeedEntry[] = [];
  let es: EventSource;
  let connected = false;
  let container: HTMLDivElement;
  let autoScroll = true;
  const MAX = 200;

  onMount(() => {
    es = new EventSource('/api/sse');

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'connected') { connected = true; return; }
      if (data.type !== 'message') return;

      feed = [
        ...feed.slice(-(MAX - 1)),
        { id: crypto.randomUUID(), direction: data.direction, message: data.message, receivedAt: Date.now() },
      ];

      if (autoScroll) setTimeout(() => container?.scrollTo(0, container.scrollHeight), 0);
    };

    es.onerror = () => { connected = false; };
  });

  onDestroy(() => es?.close());

  function clear() { feed = []; }

  const contentPreview = (m: PlatformMessage): string => {
    if (m.content.text) return m.content.text.slice(0, 80) + (m.content.text.length > 80 ? '…' : '');
    return `[${m.content.type}]`;
  };

  const platformColor: Record<string, string> = {
    whatsapp: 'text-emerald-400',
    discord:  'text-indigo-400',
    telegram: 'text-sky-400',
  };

  const dirBadge = (d: string) =>
    d === 'inbound'
      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
    <div>
      <h1 class="text-lg font-semibold">Mensagens</h1>
      <p class="text-xs text-gray-500">Feed em tempo real via Redis</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1.5 text-xs">
        <span class="w-2 h-2 rounded-full {connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}"></span>
        <span class="text-gray-500">{connected ? 'Conectado' : 'Desconectado'}</span>
      </div>
      <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input type="checkbox" bind:checked={autoScroll} class="accent-emerald-500" />
        Auto-scroll
      </label>
      <button
        on:click={clear}
        class="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
      >
        Limpar
      </button>
    </div>
  </div>

  <!-- Feed -->
  <div bind:this={container} class="flex-1 overflow-auto p-4 space-y-1.5 font-mono text-xs">
    {#if feed.length === 0}
      <div class="text-gray-700 text-center py-16">Aguardando mensagens…</div>
    {/if}
    {#each feed as entry (entry.id)}
      <div class="flex items-start gap-3 bg-gray-900 border border-gray-800/50 rounded-lg px-3 py-2 hover:border-gray-700 transition-colors">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {dirBadge(entry.direction)} shrink-0">
          {entry.direction === 'inbound' ? '↓ IN' : '↑ OUT'}
        </span>
        <span class="{platformColor[entry.message.platform] ?? 'text-gray-400'} shrink-0 w-20">
          {entry.message.platform}
        </span>
        <span class="text-gray-500 shrink-0 w-28 truncate">{entry.message.userName}</span>
        <span class="text-gray-300 flex-1 truncate">{contentPreview(entry.message)}</span>
        <span class="text-gray-700 shrink-0">
          {new Date(entry.receivedAt).toLocaleTimeString('pt-BR')}
        </span>
      </div>
    {/each}
  </div>

  <!-- Footer count -->
  <div class="px-6 py-2 border-t border-gray-800 text-xs text-gray-700">
    {feed.length} mensagem{feed.length !== 1 ? 's' : ''} · máx {MAX}
  </div>
</div>
