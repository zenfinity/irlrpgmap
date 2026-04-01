<script>
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	let { places = [] } = $props();

	/** @type {HTMLDivElement} */
	let mapContainer;
	/** @type {HTMLCanvasElement} */
	let fogCanvas;
	/** @type {mapboxgl.Map} */
	let map;

	/** @param {mapboxgl.Map} map */
	function drawFog(map) {
		const ctx = fogCanvas.getContext('2d');
		if (!ctx) return;

		const { width, height } = fogCanvas;

		ctx.clearRect(0, 0, width, height);

		// paint the darkness
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = 'rgba(45, 45, 48, 0.88)';
		ctx.fillRect(0, 0, width, height);

		// erase fog where places are known
		ctx.globalCompositeOperation = 'destination-out';

		for (const place of places) {
			const { x, y } = map.project([place.lng, place.lat]);
			const score = place.familiarityScore;

			const innerRadius = 15 + score * 70;
			const outerRadius = innerRadius + 35;

			const gradient = ctx.createRadialGradient(x, y, 0, x, y, outerRadius);
			gradient.addColorStop(0, `rgba(0, 0, 0, ${0.3 + score * 0.7})`);
			gradient.addColorStop(innerRadius / outerRadius, `rgba(0, 0, 0, ${0.2 + score * 0.5})`);
			gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
			ctx.fill();
		}

		// restore default for any future draws
		ctx.globalCompositeOperation = 'source-over';
	}

	function syncCanvasSize() {
		fogCanvas.width = mapContainer.offsetWidth;
		fogCanvas.height = mapContainer.offsetHeight;
	}

	onMount(() => {
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/dark-v11',
			center: [-122.6089, 45.5601],
			zoom: 11
		});

		map.on('load', () => {
			map.getStyle().layers
				.filter((layer) => layer['source-layer'] === 'road')
				.forEach((layer) => map.setLayoutProperty(layer.id, 'visibility', 'none'));

			syncCanvasSize();
			drawFog(map);

			map.on('render', () => drawFog(map));
			map.on('resize', () => {
				syncCanvasSize();
				drawFog(map);
			});
		});

		return () => map.remove();
	});
</script>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map"></div>
	<canvas bind:this={fogCanvas} class="fog"></canvas>
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100vh;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	.fog {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
	}
</style>
