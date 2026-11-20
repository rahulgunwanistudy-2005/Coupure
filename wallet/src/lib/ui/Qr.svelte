<script lang="ts">
	// QR rendered as one SVG path from qrcode-generator's module matrix: no inline styles, CSP-safe.
	import qrcode from 'qrcode-generator';
	import { t } from '#lib/i18n/index.svelte.ts';

	let { value, label }: { value: string; label: string } = $props();

	const path = $derived.by(() => {
		try {
		const qr = qrcode(0, 'L');
		qr.addData(value, 'Byte');
		qr.make();
		const n = qr.getModuleCount();
		let d = '';
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
		return { d, size: n + 8 };
		} catch { return null; }
	});
</script>

{#if path}
<svg class="qr" viewBox="0 0 {path.size} {path.size}" role="img" aria-label={label} shape-rendering="crispEdges">
	<rect width={path.size} height={path.size} fill="#fff" />
	<path d={path.d} fill="#000" />
</svg>
{:else}<p role="status">{t('qr.large')}</p>{/if}

<style>
	.qr {
		width: min(100%, 22rem);
		height: auto;
		display: block;
		margin: 0 auto;
	}
</style>
