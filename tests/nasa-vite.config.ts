import { defineConfig } from 'vite';
import config from '../vite.config';
export default defineConfig({
  ...config,
  server: { host: '127.0.0.1', port: 5184, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8014' } }
});
