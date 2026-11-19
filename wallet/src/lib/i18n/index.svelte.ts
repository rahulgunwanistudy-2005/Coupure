import { en } from './en';
import { fr, type MessageKey } from './fr';
import { wo } from './wo';

export type Lang = 'fr' | 'en' | 'wo';
const catalogues: Record<Lang, Partial<Record<MessageKey, string>>> = { fr, en, wo };

const KEY = 'coupure.lang';
function initial(): Lang {
	try {
		const v = localStorage.getItem(KEY);
		if (v === 'fr' || v === 'en' || v === 'wo') return v;
	} catch {
		/* storage blocked: default to French */
	}
	return 'fr';
}

export const i18n = $state({ lang: initial() as Lang });

export function setLang(lang: Lang): void {
	i18n.lang = lang;
	try {
		localStorage.setItem(KEY, lang);
	} catch {
		/* per-viewer convenience only */
	}
	if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** Translate. Falls back to French for any key a catalogue does not have (Wolof is partial on purpose). */
export function t(key: MessageKey, params?: Record<string, string | number | bigint>): string {
	let s = catalogues[i18n.lang][key] ?? fr[key];
	if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
	return s;
}
