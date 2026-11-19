<script lang="ts">import { t } from '#lib/i18n/index.svelte.ts';</script>
<main class="wide stack">
 <p class="eyebrow">{t('tour.kicker')}</p><h1 class="display">{t('tour.title')}</h1><p class="lead">{t('tour.intro')}</p>
 <ol class="tour-steps">{#each [1,2,3,4,5,6] as n}<li><span class="step-number" aria-hidden="true">{String(n).padStart(2, '0')}</span><p>{t(`tour.${n}` as 'tour.1')}</p></li>{/each}</ol>
 <div class="actions"><a class="button primary" href="/">{t('onb.create')}</a><a class="button" href="/op">{t('nav.operator')}</a><a class="button" href="/tableau">{t('nav.board')}</a></div>
</main>
