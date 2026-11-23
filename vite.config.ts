import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
	// HOST in .env (e.g. 0.0.0.0) lets phones on your Wi-Fi open the app while developing, as it does
	// for the server.
	const host = process.env.HOST ?? loadEnv(mode, process.cwd(), '').HOST ?? 'localhost';
	return {
		root: 'web',
		plugins: [react()],
		// Tailscale addresses (*.ts.net) are allowed, so phones away from home can open it too.
		// The server sees the page's own address (not 127.0.0.1:3000), so the links it makes, like Google's
		// return address (http://localhost:5173/api/account/google/callback), point back at this page.
		server: {
			port: 5173,
			host,
			allowedHosts: ['.ts.net'],
			proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
		},
		build: { outDir: 'dist', emptyOutDir: true },
		test: { root: '.', include: ['server/**/*.test.ts', 'web/src/**/*.test.ts'], env: { NODE_ENV: 'test' } },
	} as any;
});
