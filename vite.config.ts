import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserPages = repoName.endsWith('.github.io');
const pagesBase = process.env.GITHUB_ACTIONS && repoName && !isUserPages
  ? `/${repoName}/`
  : '/';

export default defineConfig({
  base: pagesBase,
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    watch: { ignored: ['**/.tmp-*/**', '**/screenshots/sky-world/**'] },
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
