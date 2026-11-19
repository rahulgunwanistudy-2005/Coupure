import { defineConfig, devices } from '@playwright/test';

// Runs against the real compose stack (make up && make seed). Nothing is mocked.
export default defineConfig({
	testDir: 'e2e',
	timeout: 180_000,
	expect: { timeout: 30_000 },
	fullyParallel: false,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: process.env.COUPURE_URL ?? 'http://localhost:8080',
		...devices['Pixel 7'],
		locale: 'fr-FR',
		video: 'on',
		trace: 'retain-on-failure'
	}
});
