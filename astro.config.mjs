// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://fastestads.com',
  output: 'static',
  adapter: cloudflare(),
  integrations: [preact(), sitemap()],
});
