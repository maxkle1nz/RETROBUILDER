import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const RETROBUILDER_WATCH_IGNORES = [
  '**/.retrobuilder/**',
  '**/.omx/**',
  '**/artifacts/**',
  '**/generated-workspace/**',
  '**/dist/**',
];

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const disableHmr = process.env.DISABLE_HMR === 'true' || env.DISABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // No client-side AI keys needed — all AI calls route through the Express backend
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: !disableHmr,
      ...(disableHmr ? { ws: false, watch: null } : { watch: { ignored: RETROBUILDER_WATCH_IGNORES } }),
    },
    build: {
      modulePreload: {
        resolveDependencies: (_filename, deps, context) => {
          if (context.hostType !== 'html') {
            return deps;
          }

          return deps.filter((dep) => (
            dep.includes('vendor') ||
            dep.includes('xyflow') ||
            dep.includes('motion') ||
            dep.includes('icons') ||
            dep.includes('markdown')
          ));
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@xyflow')) return 'xyflow';
              if (id.includes('react-markdown')) return 'markdown';
              if (id.includes('motion')) return 'motion';
              if (id.includes('lucide-react')) return 'icons';
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
