<script>
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	/**
	 * @typedef {{type: string, coordinates: any}} GeoJsonGeom
	 * @typedef {{name: string, polygon: GeoJsonGeom|null, completionPct: number|null, centroidLat: number, centroidLng: number}} NeighborhoodInfo
	 */
	/** @type {{ places?: import('./parseVisits.js').Place[], neighborhoods?: NeighborhoodInfo[], activeNeighborhood?: string|null, neighborhoodData?: {polygon: GeoJsonGeom|null, userPolygon: GeoJsonGeom|null, completionPct: number|null}|null, onNeighborhoodSelect?: (name: string) => void }} */
	let { places = [], neighborhoods = [], activeNeighborhood = null, neighborhoodData = null, onNeighborhoodSelect } = $props();

	let mapContainer = $state();
	let fogCanvas = $state();
	/** @type {mapboxgl.Map} */
	let map;

	/** Places visible in the current view (all in world, filtered in area) */
	const visiblePlaces = $derived(
		activeNeighborhood
			? places.filter((p) => p.neighborhood === activeNeighborhood)
			: places
	);

	/**
	 * Convert a real-world meter radius to screen pixels at a given zoom and latitude.
	 * @param {number} meters
	 * @param {number} zoom
	 * @param {number} lat
	 * @returns {number}
	 */
	function metersToPixels(meters, zoom, lat) {
		const earthCircumference = 40075016.686;
		return (meters * 256 * Math.pow(2, zoom)) / (earthCircumference * Math.cos((lat * Math.PI) / 180));
	}

	/** @param {mapboxgl.Map} map */
	function drawFog(map) {
		const ctx = fogCanvas.getContext('2d');
		if (!ctx) return;

		const { width, height } = fogCanvas;
		const zoom = map.getZoom();

		ctx.clearRect(0, 0, width, height);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = getComputedStyle(fogCanvas).getPropertyValue('--fog-color').trim();
		ctx.fillRect(0, 0, width, height);

		ctx.globalCompositeOperation = 'destination-out';

		if (!activeNeighborhood) {
			// World view: reveal neighborhood shapes with alpha proportional to completion
			for (const nb of neighborhoods) {
				if (nb.polygon) {
					// alpha: 0.15 at 0% explored → 0.90 at 100% explored
					const alpha = 0.15 + ((nb.completionPct ?? 0) / 100) * 0.75;
					fillGeoJsonPolygon(ctx, map, nb.polygon, alpha);
				} else {
					// No polygon cached yet — soft circle at centroid
					const { x, y } = map.project([nb.centroidLng, nb.centroidLat]);
					const radius = metersToPixels(400, zoom, nb.centroidLat);
					const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
					g.addColorStop(0, 'rgba(0,0,0,0.2)');
					g.addColorStop(0.6, 'rgba(0,0,0,0.08)');
					g.addColorStop(1, 'rgba(0,0,0,0)');
					ctx.fillStyle = g;
					ctx.beginPath();
					ctx.arc(x, y, radius, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			// Places with no neighborhood still get a gentle circle reveal
			for (const place of places.filter((p) => !p.neighborhood)) {
				const { x, y } = map.project([place.lng, place.lat]);
				const radius = metersToPixels(300, zoom, place.lat);
				const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
				g.addColorStop(0, 'rgba(0,0,0,0.25)');
				g.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(x, y, radius, 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			// Area view: circle-based reveals around individual visited places
			for (const place of visiblePlaces) {
				const { x, y } = map.project([place.lng, place.lat]);
				const score = place.familiarityScore;

				const innerMeters = 100 + score * 600;
				const outerMeters = innerMeters + 200;
				const innerRadius = metersToPixels(innerMeters, zoom, place.lat);
				const outerRadius = metersToPixels(outerMeters, zoom, place.lat);

				const gradient = ctx.createRadialGradient(x, y, 0, x, y, outerRadius);
				gradient.addColorStop(0, `rgba(0, 0, 0, ${0.3 + score * 0.7})`);
				gradient.addColorStop(0.55, `rgba(0, 0, 0, ${0.15 + score * 0.4})`);
				gradient.addColorStop(innerRadius / outerRadius, 'rgba(0, 0, 0, 0)');
				gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

				ctx.fillStyle = gradient;
				ctx.beginPath();
				ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.globalCompositeOperation = 'source-over';

			// User convex hull — solid outline showing explored shape
			if (neighborhoodData?.userPolygon) {
				drawGeoJsonPolygon(ctx, map, neighborhoodData.userPolygon, {
					strokeStyle: 'hsl(220, 60%, 40%)',
					lineWidth: 2,
					globalAlpha: 0.9,
					lineDash: []
				});
			}
			// Real boundary — faint dashed outline
			if (neighborhoodData?.polygon) {
				drawGeoJsonPolygon(ctx, map, neighborhoodData.polygon, {
					strokeStyle: 'hsl(220, 60%, 40%)',
					lineWidth: 1.5,
					globalAlpha: 0.35,
					lineDash: [6, 4]
				});
			}
		}

		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	/**
	 * Fill a GeoJSON Polygon or MultiPolygon on the canvas (for fog destination-out).
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {mapboxgl.Map} map
	 * @param {GeoJsonGeom} geojson
	 * @param {number} alpha
	 */
	function fillGeoJsonPolygon(ctx, map, geojson, alpha) {
		const rings = geojson.type === 'MultiPolygon'
			? geojson.coordinates.flat(1)
			: geojson.coordinates;
		ctx.globalAlpha = alpha;
		ctx.fillStyle = 'rgba(0,0,0,1)';
		for (const ring of rings) {
			if (!ring.length) continue;
			ctx.beginPath();
			for (let i = 0; i < ring.length; i++) {
				const { x, y } = map.project(ring[i]);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	/**
	 * Draw a GeoJSON Polygon or MultiPolygon onto the canvas.
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {mapboxgl.Map} map
	 * @param {{ type: string, coordinates: any }} geojson
	 * @param {{ strokeStyle: string, lineWidth: number, globalAlpha: number, lineDash: number[] }} style
	 */
	function drawGeoJsonPolygon(ctx, map, geojson, style) {
		const rings = geojson.type === 'MultiPolygon'
			? geojson.coordinates.flat(1)
			: geojson.coordinates;

		ctx.strokeStyle = style.strokeStyle;
		ctx.lineWidth = style.lineWidth;
		ctx.globalAlpha = style.globalAlpha;
		ctx.setLineDash(style.lineDash);

		for (const ring of rings) {
			if (!ring.length) continue;
			ctx.beginPath();
			for (let i = 0; i < ring.length; i++) {
				const { x, y } = map.project(ring[i]);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();
		}

		ctx.setLineDash([]);
		ctx.globalAlpha = 1;
	}

	function syncCanvasSize() {
		fogCanvas.width = mapContainer.offsetWidth;
		fogCanvas.height = mapContainer.offsetHeight;
	}

	/**
	 * @param {Array<{lat: number, lng: number}>} ps
	 * @returns {[number, number, number, number]|null} [minLng, minLat, maxLng, maxLat]
	 */
	function getBbox(ps) {
		if (!ps.length) return null;
		return [
			Math.min(...ps.map((p) => p.lng)),
			Math.min(...ps.map((p) => p.lat)),
			Math.max(...ps.map((p) => p.lng)),
			Math.max(...ps.map((p) => p.lat))
		];
	}

	function updatePinsSource() {
		if (!map?.getSource('places')) return;
		/** @type {mapboxgl.GeoJSONSource} */ (map.getSource('places')).setData({
			type: 'FeatureCollection',
			features: places.map((p) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
				properties: { name: p.name, neighborhood: p.neighborhood ?? '' }
			}))
		});
	}

	$effect(() => {
		places; neighborhoods; activeNeighborhood; neighborhoodData;
		if (!map) return;

		updatePinsSource();
		drawFog(map);

		if (map.getLayer('clusters')) {
			// Cluster circles hidden in both views — fog reveals are the visualization
			map.setPaintProperty('clusters', 'circle-opacity', 0);
			map.setPaintProperty('clusters', 'circle-stroke-opacity', 0);
			// Neighborhood labels only useful in World view
			map.setLayoutProperty('cluster-labels', 'visibility', activeNeighborhood ? 'none' : 'visible');
		}

		const bbox = getBbox(visiblePlaces);
		if (bbox) {
			map.fitBounds([bbox[0], bbox[1], bbox[2], bbox[3]], { padding: 80, duration: 800, maxZoom: 14 });
		}
	});

	onMount(() => {
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/light-v11',
			center: [-122.6089, 45.5601],
			zoom: 11
		});

		map.on('load', () => {
			map.getStyle().layers
				.filter((layer) => layer['source-layer'] === 'road')
				.forEach((layer) => map.setLayoutProperty(layer.id, 'visibility', 'none'));

			// --- Places source (clustered) ---
			map.addSource('places', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
				cluster: true,
				clusterRadius: 60,
				clusterProperties: {
					// carry first non-empty neighborhood name through the cluster
					neighborhood: ['coalesce', ['get', 'neighborhood'], '']
				}
			});

			// Cluster circle
			map.addLayer({
				id: 'clusters',
				type: 'circle',
				source: 'places',
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': 'hsl(220, 60%, 40%)',
					'circle-radius': 18,
					'circle-opacity': 0.85
				}
			});

			// Cluster neighborhood label
			map.addLayer({
				id: 'cluster-labels',
				type: 'symbol',
				source: 'places',
				filter: ['has', 'point_count'],
				layout: {
					'text-field': ['get', 'neighborhood'],
					'text-size': 11,
					'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
					'text-anchor': 'center',
					'text-offset': [0, 0]
				},
				paint: {
					'text-color': 'hsl(220, 60%, 40%)',
					'text-halo-color': '#fff',
					'text-halo-width': 1.5
				}
			});

			// Individual pin
			map.addLayer({
				id: 'pins',
				type: 'circle',
				source: 'places',
				filter: ['!', ['has', 'point_count']],
				paint: {
					'circle-color': 'hsl(220, 60%, 40%)',
					'circle-radius': 6,
					'circle-stroke-width': 1.5,
					'circle-stroke-color': '#fff',
					'circle-opacity': 0.9
				}
			});

			// Click handlers
			map.on('click', 'clusters', (e) => {
				const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
				const neighborhood = features[0]?.properties?.neighborhood;
				if (neighborhood && onNeighborhoodSelect) onNeighborhoodSelect(neighborhood);
			});

			map.on('click', 'pins', (e) => {
				const features = map.queryRenderedFeatures(e.point, { layers: ['pins'] });
				const neighborhood = features[0]?.properties?.neighborhood;
				if (neighborhood && onNeighborhoodSelect) onNeighborhoodSelect(neighborhood);
			});

			map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
			map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
			map.on('mouseenter', 'pins', () => { map.getCanvas().style.cursor = 'pointer'; });
			map.on('mouseleave', 'pins', () => { map.getCanvas().style.cursor = ''; });

			syncCanvasSize();
			updatePinsSource();
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
		height: calc(100vh - var(--header-height));
		margin-top: var(--header-height);
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
