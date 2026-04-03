<script>
	import Map from '$lib/Map.svelte';
	import { parseVisits, computeFamiliarity } from '$lib/parseVisits.js';
	import takeoutData from '$lib/data/synthetic_location_data.json';

	const visits = parseVisits(takeoutData);
	const places = computeFamiliarity(visits);
</script>

<header>
	<span class="wordmark">irlrpgmap</span>
	<nav>
		<ul>
			<li>
				<details class="dropdown">
					<summary></summary>
					<ul dir="rtl">
						<li>
							<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener"
								>GitHub</a
							>
						</li>
					</ul>
				</details>
			</li>
		</ul>
	</nav>
</header>

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
		overflow: visible;
	}

	details {
		align-self: center;
		margin: 0;
	}

	summary:focus-visible {
		outline: none;
	}
</style>
