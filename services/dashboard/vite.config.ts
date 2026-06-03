import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  envDir: path.resolve(__dirname, '../../'),
  server: {
    port: parseInt(process.env.DASHBOARD_PORT ?? '3323'),
  },
});
