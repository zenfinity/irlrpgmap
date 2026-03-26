<script>
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	let mapContainer;
	let map;

	onMount(() => {
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/dark-v11',
			center: [-122.6089, 45.5601],
			zoom: 12
		});

		return () => map.remove();
	});
</script>

<div bind:this={mapContainer} class="map" />

<style>
	.map {
		width: 100%;
		height: 100vh;
	}
</style>
