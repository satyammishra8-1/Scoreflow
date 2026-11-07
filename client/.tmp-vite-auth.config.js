import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

export default mergeConfig(base, defineConfig({
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    host: 'localhost', port: 5174, strictPort: true,
    proxy: { '/api': 'http://localhost:5002' },
  },
}));
