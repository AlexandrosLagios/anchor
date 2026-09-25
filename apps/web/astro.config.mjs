import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  site: process.env.PUBLIC_SITE_URL || 'https://anchor.web.app',
  server: {
    port: 4321,
  },
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/whatsapp': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  },
});
