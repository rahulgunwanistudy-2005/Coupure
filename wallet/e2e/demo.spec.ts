import { expect, test, type Browser, type Page } from '@playwright/test';

// The scripted demo, steps 1–5 (G1): fund → pay → cut the cable → pay on the island → double-spend refused.
// Real bitcoind, real LND, real Nutshell, real partition. Three phones: a buyer and two stall holders.

const PIN = '482916';

// In-app navigation, like a user tapping: a full reload locks the wallet (the key lives only in memory).
async function go(page: Page, path: string): Promise<void> {
	if (!['/', '/historique', '/parametres'].includes(path)) await page.locator('nav a[href="/"]').click();
	await page.locator(`a[href="${path}"]`).first().click();
	await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function phone(browser: Browser, stall?: string): Promise<Page> {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/');
	await page.getByTestId('onb-create').click();
	await expect(page.getByTestId('onb-words').locator('li')).toHaveCount(12);
	await page.getByTestId('onb-words-done').click();
	await page.getByTestId('onb-pin').fill(PIN);
	await page.getByTestId('onb-pin2').fill(PIN);
	await page.getByTestId('onb-pin-submit').click();
	await expect(page.getByTestId('balance')).toBeVisible();
	if (stall) {
		await go(page, '/parametres');
		await page.getByTestId('settings-stall').fill(stall);
		await page.getByTestId('settings-stall-save').click();
		await expect(page.getByRole('status').filter({ hasText: 'Enregistré' })).toBeVisible();
	}
	return page;
}

async function pay(buyer: Page, amount: number): Promise<string> {
	await go(buyer, '/payer');
	await buyer.getByTestId('pay-amount').fill(String(amount));
	await buyer.getByTestId('pay-create').click();
	const token = (await buyer.getByTestId('pay-token').textContent())!.trim();
	expect(token).toMatch(/^cashuB/);
	return token;
}

async function receive(vendor: Page, token: string): Promise<void> {
	await go(vendor, '/recevoir');
	await vendor.getByTestId('receive-token').fill(token);
	await vendor.getByTestId('receive-accept').click();
}

const digits = (s: string | null) => Number((s ?? '').replace(/\D/g, ''));

test('island demo: pay, cut, pay, double-spend refused', async ({ browser, request }) => {
	// make sure we start with the cable plugged in (a previous failed run may have left it cut)
	await request.post('/api/demo/island', { data: { action: 'restore' } }).catch(() => undefined);

	const client = await phone(browser);
	const awa = await phone(browser, 'A-01'); // first stall
	const binta = await phone(browser, 'B-07'); // second stall
	await expect(client.getByTestId('island-band')).toHaveAttribute('data-state', 'ONLINE', { timeout: 60_000 });

	await test.step('1. fund: someone abroad pays a Lightning invoice to the box', async () => {
		await go(client, '/recharger');
		await client.getByTestId('topup-amount').fill('5000');
		await client.getByTestId('topup-create').click();
		await expect(client.getByTestId('topup-invoice')).toHaveText(/^lnbcrt/);
		await client.getByTestId('topup-demo').click();
		await expect(client.getByTestId('topup-done')).toBeVisible({ timeout: 60_000 });
		await go(client, '/');
		expect(digits(await client.getByTestId('balance').textContent())).toBe(5000);
	});

	await test.step('2. pay online: buyer pays stall A, the buyer sees it claimed (NUT-17)', async () => {
		const token = await pay(client, 1000);
		await receive(awa, token);
		await expect(awa.getByTestId('receive-paid')).toContainText('1 000'.replace(' ', ' '));
		await expect(client.getByTestId('pay-claimed')).toBeVisible();
	});

	await test.step('3. cut the cable: Lightning really goes down, every phone shows ÎLOT', async () => {
		const r = await request.post('/api/demo/island', { data: { action: 'cut' } });
		expect(r.ok()).toBe(true);
		for (const p of [client, awa, binta]) {
			await expect(p.getByTestId('island-band')).toHaveAttribute('data-state', 'ISLAND', { timeout: 30_000 });
		}
		await expect
			.poll(async () => (await (await request.get('/api/island')).json()).lightning?.active, { timeout: 30_000 })
			.toBe(0);
	});

	let islandToken = '';
	await test.step('4. pay on the island: final at the local mint, no internet', async () => {
		islandToken = await pay(client, 1500);
		await receive(awa, islandToken);
		await expect(awa.getByTestId('receive-paid')).toBeVisible();
		await expect(client.getByTestId('pay-claimed')).toBeVisible();
	});

	await test.step('5. double-spend: the same coins at stall B are refused, naming stall A', async () => {
		await go(client, '/historique');
		await client.getByTestId('history-replay').first().click();
		const replay = (await client.getByTestId('history-replay-token').textContent())!.trim();
		expect(replay).toBe(islandToken);
		await receive(binta, replay);
		await expect(binta.getByTestId('receive-spent')).toBeVisible();
		await expect(binta.getByTestId('receive-spent')).toContainText('DÉJÀ DÉPENSÉ');
		await expect(binta.getByTestId('receive-spent-stall')).toContainText('A-01');
		await go(binta, '/');
		expect(digits(await binta.getByTestId('balance').textContent())).toBe(0);
		await go(awa, '/');
		expect(digits(await awa.getByTestId('balance').textContent())).toBe(2500);
	});

	await test.step('reconnect: plug the cable back, the box reconciles and goes ONLINE', async () => {
		await request.post('/api/demo/island', { data: { action: 'restore' } });
		await expect(client.getByTestId('island-band')).toHaveAttribute('data-state', 'ONLINE', { timeout: 90_000 });
		await expect
			.poll(async () => (await (await request.get('/api/island')).json()).lightning?.active, { timeout: 60_000 })
			.toBe(2);
		const verify = await (await request.get('/api/ledger/verify')).json();
		expect(verify.ok).toBe(true);
	});
});
