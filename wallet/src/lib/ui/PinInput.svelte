<script lang="ts">
	let { value = $bindable(''), label, id, testid }: { value: string; label: string; id: string; testid?: string } =
		$props();
</script>

<label for={id}>{label}</label>
<input
	{id}
	data-testid={testid}
	type="password"
	inputmode="numeric"
	autocomplete="off"
	pattern="[0-9]*"
	maxlength="6"
	bind:value
/>
