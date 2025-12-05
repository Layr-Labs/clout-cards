import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Vite plugin to serve index.html for /docs/ directory paths.
 * MkDocs generates index.html files in each directory, but Vite's dev server
 * doesn't automatically serve them for directory requests.
 * 
 * Important: We must REDIRECT paths without trailing slashes to paths WITH
 * trailing slashes, so that relative URLs in the HTML resolve correctly.
 * e.g., /docs -> /docs/ so that "assets/foo.js" resolves to /docs/assets/foo.js
 */
function serveDocsIndex(): Plugin {
  return {
    name: 'serve-docs-index',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Only handle /docs paths without file extensions
        if (req.url?.startsWith('/docs') && !req.url.includes('.')) {
          // If no trailing slash, redirect to add one (important for relative path resolution)
          if (!req.url.endsWith('/')) {
            res.writeHead(302, { Location: req.url + '/' });
            res.end();
            return;
          }
          // Has trailing slash - serve index.html
          req.url = req.url + 'index.html';
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars (including CLOUTCARDS_CONTRACT_ADDRESS)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react(), serveDocsIndex()],
    define: {
      // Map CLOUTCARDS_CONTRACT_ADDRESS to import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS
      // This allows using CLOUTCARDS_CONTRACT_ADDRESS instead of VITE_CLOUTCARDS_CONTRACT_ADDRESS
      'import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS': JSON.stringify(env.CLOUTCARDS_CONTRACT_ADDRESS),
    },
    build: {
      // Don't fail build on TypeScript errors - treat them as warnings
      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress TypeScript-related warnings during build
          if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
          warn(warning)
        },
      },
    },
  }
})
