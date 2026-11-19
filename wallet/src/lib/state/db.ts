// IndexedDB persistence. Only PIN-sealed blobs are stored; nothing readable without the PIN.
import { openDB, type IDBPDatabase } from 'idb';
import type { Sealed } from '#lib/engine/vault.ts';

const DB = 'coupure';
const STORE = 'vault';
let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
	dbp ??= openDB(DB, 1, {
		upgrade(d) {
			d.createObjectStore(STORE);
		}
	});
	return dbp;
}

export async function loadSealed(): Promise<Sealed | undefined> {
	return (await db()).get(STORE, 'main');
}

export async function saveSealed(s: Sealed): Promise<void> {
	await (await db()).put(STORE, s, 'main');
}

export async function wipe(): Promise<void> {
	await (await db()).delete(STORE, 'main');
}
