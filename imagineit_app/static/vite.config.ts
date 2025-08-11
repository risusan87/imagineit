// in imagineit_app/static/vite.config.js

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react'; // Make sure you import the react plugin

export default defineConfig(({ mode }) => {
    // Load environment variables from your .env file
    const env = loadEnv(mode, '.', '');

    return {
      // Your existing 'define' block for environment variables
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },

      // Your existing 'resolve' block for path aliases
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },

      // --- ADD THIS BLOCK ---
      // This configures the Vite development server
      server: {
        // This is the recommended setting for ngrok
        // The leading dot acts as a wildcard for subdomains.
        allowedHosts: ['.ngrok-free.app'],

        // You might also need to specify the port if it's not the default
        port: 5173, 
      },

      // You also need to include the React plugin
      plugins: [react()], 
    };
});