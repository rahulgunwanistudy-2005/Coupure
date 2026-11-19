// Wolof: amounts, main buttons and status words only; everything else falls back to French.
// Machine-drafted. Every line is tagged [wo-review] until a native speaker checks it (docs/AI_USE.md).
import type { MessageKey } from './fr';

export const wo: Partial<Record<MessageKey, string>> = {
	'home.balance': 'Xaalis bi', // [wo-review]
	'home.pay': 'Fey', // [wo-review]
	'home.receive': 'Jot', // [wo-review]
	'home.topup': 'Yokk xaalis', // [wo-review]
	'island.ONLINE': 'INTERNET AM NA', // [wo-review]
	'island.ISLAND': 'ÎLOT — internet amul', // [wo-review]
	'receive.paid': 'FEY NA', // [wo-review]
	'receive.spent': 'DÉJÀ DÉPENSÉ', // [wo-review] kept in French until reviewed: the hero word must not be wrong
	'common.continue': 'Kontine', // [wo-review]
	'common.cancel': 'Bàyyi', // [wo-review]
};
