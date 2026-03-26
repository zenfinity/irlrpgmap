<script>
	import Map from '$lib/Map.svelte';
	import { parseVisits, computeFamiliarity } from '$lib/parseVisits.js';
	import takeoutData from '$lib/data/synthetic_location_data.json';

	const visits = parseVisits(takeoutData);
	const places = computeFamiliarity(visits);
	console.log(places);
</script>

<h1>irlrpgmap</h1>
<p>It's a map you discover in real life</p>

<Map {places} />
