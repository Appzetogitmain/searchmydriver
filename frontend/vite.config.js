import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    host: true,
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
