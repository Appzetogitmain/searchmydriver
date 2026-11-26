import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

// `npm run dev:https` sets DEV_HTTPS=1 and creates the self-signed cert, so
// phones on the LAN get a secure context (needed for the microphone).
function devHttps() {
  if (process.env.DEV_HTTPS !== '1') return undefined;
  const dir = new URL('./.cert/', import.meta.url);
  return {
    key: fs.readFileSync(new URL('dev-key.pem', dir)),
    cert: fs.readFileSync(new URL('dev-cert.pem', dir)),
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5190,
    host: true,
    https: devHttps(),
    // Forward API + socket calls to the local backend during development
    proxy: {
      '/api': { target: 'http://localhost:9000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:9000', changeOrigin: true, ws: true },
    },
  },
  build: {
    // Bump warning threshold for heavy vendor chunks (Google Maps, Framer Motion)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@react-google-maps') || id.includes('@googlemaps')) return 'maps-vendor';
          if (id.includes('framer-motion')) return 'motion-vendor';
          if (id.includes('react-router')) return 'react-vendor';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
