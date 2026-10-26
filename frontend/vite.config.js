import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // three.js is only used by Home and Live (the AuraOrb). Naming its
        // chunk keeps it cached on its own instead of being folded into
        // whichever small component Rollup happens to pair it with.
        manualChunks: {
          three: ['three', '@react-three/fiber'],
        },
      },
    },
    // three.js + r3f alone is ~820 kB minified (~220 kB gzipped) and can't be
    // split further; it's lazy-loaded with the pages that use it.
    chunkSizeWarningLimit: 900,
  },
})
