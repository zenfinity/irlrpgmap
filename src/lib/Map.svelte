<script>
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	/**
	 * @typedef {{type: string, coordinates: any}} GeoJsonGeom
	 * @typedef {{name: string, polygon: GeoJsonGeom|null, completionPct: number|null, centroidLat: number, centroidLng: number, visitCount: number}} NeighborhoodInfo
	 */
	/** @type {{ places?: import('./parseVisits.js').Place[], neighborhoods?: NeighborhoodInfo[], activeNeighborhood?: string|null, neighborhoodData?: {polygon: GeoJsonGeom|null, userPolygon: GeoJsonGeom|null, completionPct: number|null}|null, onNeighborhoodSelect?: (name: string) => void, onNeighborhoodHover?: (name: string|null) => void }} */
	let { places = [], neighborhoods = [], activeNeighborhood = null, neighborhoodData = null, onNeighborhoodSelect, onNeighborhoodHover } = $props();

	let mapContainer = $state();
	let fogCanvas = $state();
	let mapMoved = $state(false);
	/** @type {mapboxgl.Map} */
	let map;

	/** Places visible in the current view (all in world, filtered in area) */
	const visiblePlaces = $derived(
		!activeNeighborhood ? places
		: activeNeighborhood === '__ungrouped__' ? places.filter((p) => !p.neighborhood)
		: places.filter((p) => p.neighborhood === activeNeighborhood)
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
					const isNew = nb.visitCount < 5;
					// New areas: gentle blur. Established: crisp soft edge.
					const blurPx = isNew ? 8 : 4;
					const alpha = isNew
						? 0.10 + (nb.visitCount / 5) * 0.08
						: 0.15 + ((nb.completionPct ?? 0) / 100) * 0.75;
					fillGeoJsonPolygon(ctx, map, nb.polygon, alpha, blurPx);
					// Faint outline so small/new neighborhoods always have visible definition
					drawGeoJsonPolygon(ctx, map, nb.polygon, {
						strokeStyle: 'rgba(0,0,0,1)',
						lineWidth: 0.75,
						globalAlpha: isNew ? 0.12 : 0.20,
						lineDash: []
					});
				} else {
					// No polygon cached yet — soft circle at centroid
					if (!isFinite(nb.centroidLng) || !isFinite(nb.centroidLat)) continue;
					const { x, y } = map.project([nb.centroidLng, nb.centroidLat]);
					const radius = metersToPixels(400, zoom, nb.centroidLat);
					if (!isFinite(x) || !isFinite(y) || !isFinite(radius) || radius <= 0) continue;
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
				if (!isFinite(place.lng) || !isFinite(place.lat)) continue;
				const { x, y } = map.project([place.lng, place.lat]);
				const radius = metersToPixels(300, zoom, place.lat);
				if (!isFinite(x) || !isFinite(y) || !isFinite(radius) || radius <= 0) continue;
				const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
				g.addColorStop(0, 'rgba(0,0,0,0.25)');
				g.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(x, y, radius, 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			// Area view
			const boundary = neighborhoodData?.polygon;

			// Two-pass reveal strategy:
			//   Pass 1 — tiny sharp circles at each pin center, stamped at full opacity
			//             so pins are always visible through the fog regardless of overlap.
			//   Pass 2 — wider soft glow for "explored area" ambiance, stamped at low
			//             opacity (0.35) so compounding glows can't saturate into a blob.

			const pinOff = new OffscreenCanvas(width, height);
			const pctx = /** @type {OffscreenCanvasRenderingContext2D} */ (pinOff.getContext('2d'));
			pctx.globalCompositeOperation = 'source-over';

			const glowOff = new OffscreenCanvas(width, height);
			const gctx = /** @type {OffscreenCanvasRenderingContext2D} */ (glowOff.getContext('2d'));
			gctx.globalCompositeOperation = 'source-over';

			for (const place of visiblePlaces) {
				if (!isFinite(place.lng) || !isFinite(place.lat)) continue;
				const { x, y } = map.project([place.lng, place.lat]);
				if (!isFinite(x) || !isFinite(y)) continue;
				const score = place.familiarityScore;

				// Pass 1: sharp pin reveal (always at least 14px, up to ~25m real-world)
				const pinPx = Math.max(14, metersToPixels(20, zoom, place.lat));
				const pinGrad = pctx.createRadialGradient(x, y, 0, x, y, pinPx);
				pinGrad.addColorStop(0.5, 'rgba(0,0,0,1)');
				pinGrad.addColorStop(1, 'rgba(0,0,0,0)');
				pctx.fillStyle = pinGrad;
				pctx.beginPath();
				pctx.arc(x, y, pinPx, 0, Math.PI * 2);
				pctx.fill();

				// Pass 2: soft ambient glow (60–160m radius, alpha 0.6–0.9 on glow canvas)
				const glowRadius = metersToPixels(60 + score * 100, zoom, place.lat);
				if (!isFinite(glowRadius) || glowRadius <= 0) continue;
				const glowGrad = gctx.createRadialGradient(x, y, 0, x, y, glowRadius);
				glowGrad.addColorStop(0, `rgba(0,0,0,${0.6 + score * 0.3})`);
				glowGrad.addColorStop(0.5, `rgba(0,0,0,${0.3 + score * 0.2})`);
				glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
				gctx.fillStyle = glowGrad;
				gctx.beginPath();
				gctx.arc(x, y, glowRadius, 0, Math.PI * 2);
				gctx.fill();
			}

			if (boundary) {
				// Subtly lighten inside the boundary — shows the explorable area exists
				ctx.globalAlpha = 0.18;
				buildPolygonPath(ctx, map, boundary);
				ctx.fill();

				ctx.save();
				buildPolygonPath(ctx, map, boundary);
				ctx.clip();

				// Glow pass first (bounded at 35% removal — can't blob even with many overlaps)
				ctx.globalCompositeOperation = 'destination-out';
				ctx.globalAlpha = 0.35;
				ctx.drawImage(glowOff, 0, 0);

				// Pin pass on top at full opacity — pins always punched through
				ctx.globalCompositeOperation = 'destination-out';
				ctx.globalAlpha = 1;
				ctx.drawImage(pinOff, 0, 0);

				ctx.restore();

				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = 1;

				// Dungeon wall — boundary as solid stroke
				drawGeoJsonPolygon(ctx, map, boundary, {
					strokeStyle: 'hsl(220, 60%, 35%)',
					lineWidth: 2.5,
					globalAlpha: 0.85,
					lineDash: []
				});

				// User convex hull — explored shape within the dungeon
				if (neighborhoodData?.userPolygon) {
					drawGeoJsonPolygon(ctx, map, neighborhoodData.userPolygon, {
						strokeStyle: 'hsl(220, 60%, 55%)',
						lineWidth: 1.5,
						globalAlpha: 0.5,
						lineDash: [4, 3]
					});
				}
			} else {
				// No boundary — stamp reveals directly
				ctx.globalCompositeOperation = 'destination-out';
				ctx.globalAlpha = 0.35;
				ctx.drawImage(glowOff, 0, 0);
				ctx.globalCompositeOperation = 'destination-out';
				ctx.globalAlpha = 1;
				ctx.drawImage(pinOff, 0, 0);
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = 1;
			}
		}

		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	/**
	 * Build a canvas path for a GeoJSON Polygon or MultiPolygon without filling/stroking.
	 * Used for clipping and as a building block for fills.
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {mapboxgl.Map} map
	 * @param {GeoJsonGeom} geojson
	 */
	function buildPolygonPath(ctx, map, geojson) {
		const rings = geojson.type === 'MultiPolygon'
			? geojson.coordinates.flat(1)
			: geojson.coordinates;
		ctx.beginPath();
		for (const ring of rings) {
			let started = false;
			for (const coord of ring) {
				if (!isFinite(coord[0]) || !isFinite(coord[1])) continue;
				const { x, y } = map.project(coord);
				if (!started) { ctx.moveTo(x, y); started = true; }
				else ctx.lineTo(x, y);
			}
			if (started) ctx.closePath();
		}
	}

	/**
	 * Fill a GeoJSON Polygon or MultiPolygon on the canvas (for fog destination-out).
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {mapboxgl.Map} map
	 * @param {GeoJsonGeom} geojson
	 * @param {number} alpha
	 * @param {number} [blurPx]
	 */
	function fillGeoJsonPolygon(ctx, map, geojson, alpha, blurPx = 8) {
		ctx.filter = `blur(${blurPx}px)`;
		ctx.globalAlpha = alpha;
		ctx.fillStyle = 'rgba(0,0,0,1)';
		buildPolygonPath(ctx, map, geojson);
		ctx.fill();
		ctx.filter = 'none';
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
			if (!ring?.length) continue;
			ctx.beginPath();
			let started = false;
			for (const coord of ring) {
				if (!Array.isArray(coord) || !isFinite(coord[0]) || !isFinite(coord[1])) continue;
				const { x, y } = map.project(/** @type {[number,number]} */ (coord));
				if (!isFinite(x) || !isFinite(y)) continue;
				if (!started) { ctx.moveTo(x, y); started = true; }
				else ctx.lineTo(x, y);
			}
			if (started) { ctx.closePath(); ctx.stroke(); }
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
				properties: { name: p.name, neighborhood: p.neighborhood ?? '', visitCount: p.visitCount, totalDwellMinutes: p.totalDwellMinutes }
			}))
		});
	}

	function updateNeighborhoodSource() {
		if (!map?.getSource('neighborhood-areas')) return;
		/** @type {mapboxgl.GeoJSONSource} */ (map.getSource('neighborhood-areas')).setData({
			type: 'FeatureCollection',
			features: neighborhoods
				.filter((nb) => isFinite(nb.centroidLng) && isFinite(nb.centroidLat))
				.map((nb) => ({
					type: /** @type {const} */ ('Feature'),
					properties: { name: nb.name },
					geometry: /** @type {any} */ (nb.polygon ?? { type: 'Point', coordinates: [nb.centroidLng, nb.centroidLat] })
				}))
		});
	}

	function fitToVisible() {
		const bbox = getBbox(visiblePlaces);
		if (bbox) {
			mapMoved = false;
			map.fitBounds(bbox, { padding: 80, duration: 800, maxZoom: 14 });
		}
	}

	$effect(() => {
		places; neighborhoods; activeNeighborhood; neighborhoodData;
		if (!map) return;

		updatePinsSource();
		updateNeighborhoodSource();
		drawFog(map);

		const inArea = !!activeNeighborhood;
		if (map.getLayer('cluster-labels')) {
			map.setLayoutProperty('cluster-labels', 'visibility', inArea ? 'none' : 'visible');
		}
		if (map.getLayer('pins')) {
			map.setPaintProperty('pins', 'circle-opacity', inArea ? 0.9 : 0);
			map.setPaintProperty('pins', 'circle-stroke-opacity', inArea ? 1 : 0);
		}
		if (map.getLayer('neighborhood-fills')) {
			map.setLayoutProperty('neighborhood-fills', 'visibility', inArea ? 'none' : 'visible');
		}
		if (map.getLayer('neighborhood-centroids')) {
			map.setLayoutProperty('neighborhood-centroids', 'visibility', inArea ? 'none' : 'visible');
		}

		fitToVisible();
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

			// Cluster circle — invisible, kept only as a click target
			map.addLayer({
				id: 'clusters',
				type: 'circle',
				source: 'places',
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': 'hsl(220, 60%, 40%)',
					'circle-radius': 18,
					'circle-opacity': 0,
					'circle-stroke-opacity': 0
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

			// Individual pin — invisible in World view, shown in Area view
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
					'circle-opacity': 0,
					'circle-stroke-opacity': 0
				}
			});

			// --- Neighborhood hit areas (World view hover + click) ---
			map.addSource('neighborhood-areas', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});

			// Transparent fill for polygon neighborhoods
			map.addLayer({
				id: 'neighborhood-fills',
				type: 'fill',
				source: 'neighborhood-areas',
				filter: ['==', '$type', 'Polygon'],
				paint: { 'fill-opacity': 0 }
			});

			// Transparent circle for centroid-only neighborhoods
			map.addLayer({
				id: 'neighborhood-centroids',
				type: 'circle',
				source: 'neighborhood-areas',
				filter: ['==', '$type', 'Point'],
				paint: { 'circle-radius': 40, 'circle-opacity': 0, 'circle-stroke-opacity': 0 }
			});

			updateNeighborhoodSource();

			const popup = new mapboxgl.Popup({
				closeButton: false,
				closeOnClick: false,
				offset: [0, -10]
			});

			// World view: click fog reveal to enter Area view
			for (const layer of ['neighborhood-fills', 'neighborhood-centroids']) {
				map.on('click', layer, (e) => {
					if (activeNeighborhood) return;
					const name = e.features?.[0]?.properties?.name;
					if (name && onNeighborhoodSelect) onNeighborhoodSelect(name);
				});
			}

			// World view: mousemove to update header name — avoids enter/leave
			// ordering issues when moving between adjacent polygons
			map.on('mousemove', (e) => {
				if (activeNeighborhood) return;
				const features = map.queryRenderedFeatures(e.point, { layers: ['neighborhood-fills', 'neighborhood-centroids'] });
				onNeighborhoodHover?.(features[0]?.properties?.name ?? null);
			});

			map.on('click', 'pins', (e) => {
				const features = map.queryRenderedFeatures(e.point, { layers: ['pins'] });
				const neighborhood = features[0]?.properties?.neighborhood || '__ungrouped__';
				if (!activeNeighborhood) {
					// World view: ungrouped pins only (neighborhood pins handled by neighborhood-fills)
					if (neighborhood === '__ungrouped__' && onNeighborhoodSelect) onNeighborhoodSelect('__ungrouped__');
				} else if (neighborhood !== activeNeighborhood) {
					// Area view: clicking a pin from a different area navigates there
					if (onNeighborhoodSelect) onNeighborhoodSelect(neighborhood);
				}
			});

			// Area view: hover pin to show place details
			map.on('mouseenter', 'pins', (e) => {
				if (!activeNeighborhood) return;
				map.getCanvas().style.cursor = 'pointer';
				const feature = e.features?.[0];
				if (!feature) return;
				const { name, visitCount, totalDwellMinutes } = feature.properties ?? {};
				if (!name) return;
				const visits = `${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`;
				const mins = Math.round(totalDwellMinutes ?? 0);
				const time = mins >= 60
					? `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim()
					: mins > 0 ? `${mins}m` : null;
				const html = `<strong>${name}</strong><br>${visits}${time ? ` · ${time}` : ''}`;
				const coords = /** @type {[number, number]} */ ((/** @type {any} */ (feature.geometry)).coordinates.slice());
				popup.setLngLat(coords).setHTML(html).addTo(map);
			});
			map.on('mouseleave', 'pins', () => {
				map.getCanvas().style.cursor = '';
				popup.remove();
			});

			syncCanvasSize();
			updatePinsSource();
			updateNeighborhoodSource();
			drawFog(map);
			fitToVisible();


			map.on('moveend', (e) => { if (e.originalEvent) mapMoved = true; });
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
	{#if visiblePlaces.length > 0 && mapMoved}
		<button class="recenter-btn" onclick={fitToVisible} title="Fit to pins" aria-label="Recenter map">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
				<path d="M1 1h4M1 1v4M13 1h-4M13 1v4M1 13h4M1 13v-4M13 13h-4M13 13v-4"/>
			</svg>
		</button>
	{/if}
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

	:global(.mapboxgl-popup) {
		z-index: 2;
	}

	:global(.mapboxgl-popup-content) {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-family: inherit;
		border-radius: 0.25rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
		pointer-events: none;
	}

	:global(.mapboxgl-popup-tip) {
		display: none;
	}

	.recenter-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 2;
		width: 2rem;
		height: 2rem;
		margin: 0;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--pico-background-color);
		border: 1px solid var(--pico-muted-border-color);
		border-radius: 0.3rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
		cursor: pointer;
		color: var(--pico-color);
		line-height: 1;
	}
</style>
