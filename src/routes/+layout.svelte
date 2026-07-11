<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Visual R-Info</title>
	<meta
		name="description"
		content="Entorno web educativo para escribir y ejecutar programas R-Info."
	/>
</svelte:head>
{@render children()}
