<script>
	import Map from '$lib/Map.svelte';
	import { parseVisits, computeFamiliarity } from '$lib/parseVisits.js';
	import takeoutData from '$lib/data/synthetic_location_data.json';

	const visits = parseVisits(takeoutData);
	const places = computeFamiliarity(visits);

	let sidebarOpen = $state(false);
</script>

<header>
	<span class="wordmark">irlrpgmap</span>
	<button onclick={() => (sidebarOpen = true)} aria-label="Open menu">☰</button>
</header>

{#if sidebarOpen}
	<div class="scrim" onclick={() => (sidebarOpen = false)}></div>
{/if}

<aside class:open={sidebarOpen}>
	<button onclick={() => (sidebarOpen = false)} aria-label="Close menu">✕</button>
	<nav>
		<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener">GitHub</a>
	</nav>
</aside>

<Map {places} />

<style>
	header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		height: var(--header-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgba(0, 0, 0, 0.2);
	}

	aside {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		width: 260px;
		transform: translateX(100%);
		transition: transform 0.25s ease;
	}

	aside.open {
		transform: translateX(0);
	}
</style>
