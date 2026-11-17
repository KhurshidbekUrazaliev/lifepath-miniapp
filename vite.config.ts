import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * A short name for this build: when it was made (UTC) and from which commit, like
 * "261117.0423-edab962". About shows it and an error report carries it (src/lib/build.ts). Newer
 * builds sort after older ones.
 */
function buildId(): string {
  const made = new Date().toISOString().replace(/[-:]/g, '');
  const when = `${made.slice(2, 8)}.${made.slice(9, 13)}`;
  try {
    const commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /^[0-9a-f]{7,12}$/.test(commit) ? `${when}-${commit}` : when;
  } catch {
    return when; // built outside a git checkout
  }
}

// The Worker (wrangler dev, port 8787) serves /api during local development.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // A build knows its name; the dev server is simply "dev".
  define: command === 'build' ? { __LP_BUILD__: JSON.stringify(buildId()) } : {},
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Three kinds of file. Everything the first screen needs is one file. A screen or sheet that is
        // fetched on demand is a file of its own or one of a group's (src/ui/onDemand.tsx). And what
        // several of those share but the first screen does not need (an icon, a field) is one more
        // file, where it would otherwise be a dozen tiny ones.
        codeSplitting: {
          groups: [
            { name: 'first', tags: ['$initial'], priority: 2 },
            { name: 'shared', minShareCount: 2, priority: 1 },
          ],
        },
      },
    },
  },
}));
