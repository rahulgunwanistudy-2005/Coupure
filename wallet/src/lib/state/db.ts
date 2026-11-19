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

export async function loadVault(): Promise<{ sealed: Sealed | undefined; revision: number }> {
	const tx = (await db()).transaction(STORE, 'readonly');
	const sealed = await tx.store.get('main');
	const revision = (await tx.store.get('revision')) ?? 0;
	await tx.done;
	return { sealed, revision };
}

export class VaultConflict extends Error {}

export async function saveSealed(s: Sealed, expected: number): Promise<number> {
	const tx = (await db()).transaction(STORE, 'readwrite');
	const current = (await tx.store.get('revision')) ?? 0;
	if (current !== expected) { await tx.done; throw new VaultConflict('wallet changed in another tab'); }
	await tx.store.put(s, 'main');
	await tx.store.put(current + 1, 'revision');
	await tx.done;
	return current + 1;
}

export async function wipe(expected: number): Promise<void> {
	const tx = (await db()).transaction(STORE, 'readwrite');
	const current = (await tx.store.get('revision')) ?? 0;
	if (current !== expected) { await tx.done; throw new VaultConflict('wallet changed in another tab'); }
	await tx.store.delete('main');
	await tx.store.put(current + 1, 'revision');
	await tx.done;
}
