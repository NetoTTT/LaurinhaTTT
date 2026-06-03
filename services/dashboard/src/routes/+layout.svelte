<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';

  const nav = [
    { href: '/',          label: 'Overview',   icon: '▦' },
    { href: '/whatsapp',  label: 'WhatsApp',   icon: '◉' },
    { href: '/messages',  label: 'Mensagens',  icon: '≋' },
    { href: '/commands',  label: 'Comandos',   icon: '⌘' },
  ];

  $: current = $page.url.pathname;
</script>

<div class="flex h-screen bg-gray-950 text-white overflow-hidden">
  <!-- Sidebar -->
  <nav class="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
    <div class="px-4 py-5 border-b border-gray-800">
      <div class="text-emerald-400 font-bold text-sm tracking-wide">LAURINHA TTT</div>
      <div class="text-gray-600 text-xs mt-0.5">Dashboard v1</div>
    </div>

    <ul class="flex-1 p-2 space-y-0.5">
      {#each nav as item}
        <li>
          <a
            href={item.href}
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
              {current === item.href
                ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'}"
          >
            <span class="text-base w-5 text-center leading-none">{item.icon}</span>
            {item.label}
          </a>
        </li>
      {/each}
    </ul>

    <div class="px-4 py-3 border-t border-gray-800 text-xs text-gray-700">
      © 2026 NetoTTT
    </div>
  </nav>

  <!-- Main content -->
  <main class="flex-1 overflow-auto">
    <slot />
  </main>
</div>
