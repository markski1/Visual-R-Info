<script lang="ts">
	import { onMount } from 'svelte';

	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.register('/service-worker.js');
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#1d1e1a" />
	<link rel="apple-touch-icon" href="/icon.svg" />
	<title>Visual R-Info</title>
	<meta
		name="description"
		content="Entorno web educativo para escribir y ejecutar programas R-Info."
	/>
</svelte:head>
{@render children()}
