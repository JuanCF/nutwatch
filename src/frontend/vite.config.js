import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    base: '/static/',
    build: {
        outDir: '../backend/static',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:8081',
                changeOrigin: true,
            },
        },
    },
});
