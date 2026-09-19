// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://fastestads.com',
  output: 'static',
  trailingSlash: 'always',
  adapter: cloudflare(),
  integrations: [
    preact(),
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/api/'),
    }),
  ],
  env: {
    schema: {
      PUBLIC_CF_BEACON_TOKEN: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_ADS_ENABLED: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_GA_MEASUREMENT_ID: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
  vite: {
    resolve: {
      alias: {
        '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
        '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
        '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      },
    },
  },
});
