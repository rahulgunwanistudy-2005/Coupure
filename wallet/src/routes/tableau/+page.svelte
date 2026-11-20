<script lang="ts">
 import { t } from '#lib/i18n/index.svelte.ts';
 import Board from '#lib/ui/Board.svelte';
</script>
<main class="wide stack">
 <p class="eyebrow">{t('board.caption')}</p>
 <h1 class="display">{t('board.title')}</h1>
 <Board />
</main>
