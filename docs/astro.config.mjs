import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
// https://astro.build/config
export default defineConfig({
  site: 'https://team-geospan.github.io',
  base: '/struct3d/',
  integrations: [react()]
});
