<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.ts';
	let { oncode }: { oncode: (code: string) => void } = $props();
	let active = $state(false), error = $state(false);
	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
	function stop() { active = false; stream?.getTracks().forEach((track) => track.stop()); stream = null; if (timer) clearTimeout(timer); }
	async function start() {
		error = false;
		const Ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
		if (!Ctor || !navigator.mediaDevices?.getUserMedia) { error = true; return; }
		try {
			const detector = new Ctor({ formats: ['qr_code'] });
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
			active = true; await tick(); video!.srcObject = stream; await video!.play();
			async function scan() {
				if (!active) return;
				try { const hits = await detector.detect(video!); if (hits[0]?.rawValue) { oncode(hits[0].rawValue); stop(); return; } }
				catch { /* wait for a sharp frame */ }
				timer = setTimeout(scan, 250);
			}
			void scan();
		} catch { stop(); error = true; }
	}
	onDestroy(stop);
</script>
{#if active}<video bind:this={video!} playsinline muted aria-label={t('scanner.start')}></video><button type="button" onclick={stop}>{t('scanner.stop')}</button>
{:else}<button type="button" onclick={start}>{t('scanner.start')}</button>{/if}
{#if error}<p role="status">{t('scanner.help')}</p>{/if}
<style>video{width:100%;max-height:320px;object-fit:cover;border:2px solid var(--line)}</style>
