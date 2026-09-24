import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        → dist/ (GitHub Pages uchun, relative paths)
// `npm run build:single` → dist-single/index.html (bitta faylli offline versiya)
// Oddiy build'da PWA (manifest + service worker) yoqiladi; bitta faylli build'da — yo‘q
const pwaMeta = {
  name: 'ssb-pwa-meta',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { name: 'ssb-pwa', content: '1' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/icon-192.png' }, injectTo: 'head' },
  ],
};

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [pwaMeta],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.js'], testTimeout: 60000 },
}));
