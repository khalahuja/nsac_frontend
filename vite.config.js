import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        // three.js alone is ~690 kB minified; it is loaded only by the 3D views.
        chunkSizeWarningLimit: 750,
        rollupOptions: {
            output: {
                // Library code in separate, long-cached files: it changes only on
                // upgrades, so returning visitors re-download just the app code.
                manualChunks(id) {
                    // Vite's lazy-page loader is used by every page; keep it out of the 3D file.
                    if (id.includes('vite/preload-helper'))
                        return 'react';
                    // React is needed by every page: its own long-cached file.
                    if (/node_modules[\/](react|react-dom|scheduler|@babel[\/]runtime)[\/]/.test(id))
                        return 'react';
                    // The 3D framework is only used by the lazily loaded 3D views.
                    if (/node_modules[\/](@react-three|three-stdlib)[\/]/.test(id))
                        return 'react-three';
                    // three.js itself is left to Rollup: the app's coordinate maths uses a few
                    // classes, which stay in the main bundle; the rest loads with the 3D views.
                    return undefined;
                }
            }
        }
    },
    server: {
        port: 5173,
        proxy: { '/api': 'http://127.0.0.1:8000' }
    }
});
