// in imagineit_app/static/vite.config.js

import path from 'path';
// --- ADD THIS IMPORT ---
import { fileURLToPath, URL } from 'url'; 
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },

      resolve: {
        alias: {
          // --- THIS IS THE CORRECTED LINE ---
          // It resolves the path relative to the current file's URL.
          '@': fileURLToPath(new URL('.', import.meta.url))
        }
      },

      server: {
        allowedHosts: ['.share.zrok.io', 'localhost'],
        port: 5173, 
      },

      plugins: [react()], 
    };
});