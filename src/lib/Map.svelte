<script>
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	let { places = [] } = $props();

	let mapContainer;
	let map;

	onMount(() => {
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/dark-v11',
			center: [-122.6089, 45.5601],
			zoom: 11
		});

		map.on('load', () => {
			map.addSource('places', {
				type: 'geojson',
				data: {
					type: 'FeatureCollection',
					features: places.map((place) => ({
						type: 'Feature',
						geometry: {
							type: 'Point',
							coordinates: [place.lng, place.lat]
						},
						properties: {
							name: place.name,
							score: place.familiarityScore
						}
					}))
				}
			});

			map.addLayer({
				id: 'familiarity-circles',
				type: 'circle',
				source: 'places',
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 0, 8, 1, 40],
					'circle-color': '#4a9eff',
					'circle-opacity': ['interpolate', ['linear'], ['get', 'score'], 0, 0.2, 1, 0.7],
					'circle-blur': 0.5
				}
			});
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
