<script>
	import exifr from 'exifr';

	const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

	/** @type {{ onDone: () => void, center?: {lat: number, lng: number}|null }} */
	let { onDone, center = null } = $props();

	let dialog = $state(/** @type {HTMLDialogElement} */ (/** @type {unknown} */ (undefined)));
	let photoInput = $state(/** @type {HTMLInputElement} */ (/** @type {unknown} */ (undefined)));

	let activeTab = $state(/** @type {'gps'|'photo'|'search'} */ ('gps'));
	let submitting = $state(false);
	let error = $state('');

	// GPS state
	let gpsLocating = $state(false);
	/** @type {{lat: number, lng: number, name: string|null}|null} */
	let gpsPlace = $state(null);

	// Photo state
	let photoProcessing = $state(false);
	/** @type {Array<{lat: number, lng: number, name: string|null, start: Date, end: Date, dwellMinutes: number, photoCount: number, removing: boolean}>} */
	let photoPlaces = $state([]);
	let photosSkipped = $state(0);

	// Search state
	let searchQuery = $state('');
	let searchResults = $state(/** @type {Array<{name: string, place_name: string, lat: number, lng: number}>} */ ([]));
	let searchDebounce = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
	let searchAbort = /** @type {AbortController|null} */ (null);
	/** @type {{name: string, lat: number, lng: number}|null} */
	let searchSelected = $state(null);
	let searchDate = $state(new Date().toISOString().slice(0, 10));

	export function open() {
		activeTab = 'gps';
		error = '';
		gpsPlace = null;
		photoPlaces = [];
		photosSkipped = 0;
		searchQuery = '';
		searchResults = [];
		searchSelected = null;
		searchDate = new Date().toISOString().slice(0, 10);
		if (searchAbort) { searchAbort.abort(); searchAbort = null; }
		dialog.showModal();
	}

	function close() {
		dialog.close();
	}

	// --- GPS ---

	async function locateNow() {
		gpsLocating = true;
		error = '';
		gpsPlace = null;
		try {
			const pos = await new Promise((resolve, reject) =>
				navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
			);
			const { latitude: lat, longitude: lng } = pos.coords;
			const name = await reverseName(lat, lng);
			gpsPlace = { lat, lng, name };
		} catch (e) {
			error = e instanceof GeolocationPositionError
				? 'Location access denied or unavailable.'
				: 'Could not get your location.';
		} finally {
			gpsLocating = false;
		}
	}

	async function submitGps() {
		if (!gpsPlace) return;
		submitting = true;
		error = '';
		try {
			const now = new Date().toISOString();
			await postVisits([{ ...gpsPlace, start: now, end: now, dwellMinutes: 0, confidence: 1, source: 'live' }]);
		} finally {
			submitting = false;
		}
	}

	// --- Photo ---

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	async function handlePhotos(e) {
		const files = [...(e.currentTarget.files ?? [])];
		if (!files.length) return;
		photoProcessing = true;
		photoPlaces = [];
		photosSkipped = 0;
		error = '';

		try {
			// Extract EXIF from all files in parallel
			const raw = await Promise.all(files.map(async (file) => {
				try {
					const exif = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] });
					if (!exif?.latitude || !exif?.longitude) return null;
					return {
						lat: exif.latitude,
						lng: exif.longitude,
						ts: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : new Date(file.lastModified)
					};
				} catch {
					return null;
				}
			}));

			const valid = /** @type {Array<{lat: number, lng: number, ts: Date}>} */ (raw.filter(Boolean)).sort((a, b) => a.ts.getTime() - b.ts.getTime());
			photosSkipped = files.length - valid.length;

			if (valid.length === 0) {
				error = 'No GPS data found in the selected photos.';
				return;
			}

			// Cluster into places
			const clusters = clusterPhotos(valid);

			// Reverse-geocode cluster centroids for names
			const named = await Promise.all(clusters.map(async (c) => ({
				...c,
				name: await reverseName(c.lat, c.lng)
			})));

			photoPlaces = named.map((c) => ({ ...c, removing: false }));
		} finally {
			photoProcessing = false;
			photoInput.value = '';
		}
	}

	/**
	 * @param {Array<{lat: number, lng: number, ts: Date}>} photos
	 */
	function clusterPhotos(photos) {
		const DISTANCE_M = 150;
		const TIME_GAP_MS = 4 * 60 * 60 * 1000;

		/** @type {Array<{lat: number, lng: number, start: Date, end: Date, dwellMinutes: number, photoCount: number}>} */
		const clusters = [];
		/** @type {typeof photos} */
		let current = [];

		for (const photo of photos) {
			if (current.length === 0) {
				current.push(photo);
				continue;
			}
			const last = current[current.length - 1];
			const dist = haversineMeters(last.lat, last.lng, photo.lat, photo.lng);
			const gap = photo.ts.getTime() - last.ts.getTime();

			if (dist <= DISTANCE_M && gap <= TIME_GAP_MS) {
				current.push(photo);
			} else {
				clusters.push(toCluster(current));
				current = [photo];
			}
		}
		if (current.length) clusters.push(toCluster(current));
		return clusters;
	}

	/** @param {Array<{lat: number, lng: number, ts: Date}>} photos */
	function toCluster(photos) {
		const lat = photos.reduce((s, p) => s + p.lat, 0) / photos.length;
		const lng = photos.reduce((s, p) => s + p.lng, 0) / photos.length;
		const start = photos[0].ts;
		const end = photos[photos.length - 1].ts;
		const dwellMinutes = Math.max(5, (end.getTime() - start.getTime()) / 60000);
		return { lat, lng, start, end, dwellMinutes, photoCount: photos.length };
	}

	/**
	 * Haversine distance in meters between two lat/lng points.
	 * @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2
	 */
	function haversineMeters(lat1, lng1, lat2, lng2) {
		const R = 6371000;
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLng = (lng2 - lng1) * Math.PI / 180;
		const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	async function submitPhotos() {
		const places = photoPlaces.filter((p) => !p.removing);
		if (!places.length) return;
		submitting = true;
		error = '';
		try {
			await postVisits(places.map((p) => ({
				lat: p.lat,
				lng: p.lng,
				name: p.name,
				start: p.start.toISOString(),
				end: p.end.toISOString(),
				dwellMinutes: p.dwellMinutes,
				confidence: 0.8,
				source: 'manual'
			})));
		} finally {
			submitting = false;
		}
	}

	// --- Search ---

	function onSearchInput() {
		if (searchDebounce) clearTimeout(searchDebounce);
		searchSelected = null;
		error = '';
		if (!searchQuery.trim()) { searchResults = []; return; }
		searchDebounce = setTimeout(runSearch, 350);
	}

	async function runSearch() {
		if (searchAbort) searchAbort.abort();
		searchAbort = new AbortController();
		try {
			const proximity = center ? `&lat=${center.lat}&lon=${center.lng}` : '';
			const res = await fetch(
				`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=5${proximity}`,
				{ signal: searchAbort.signal }
			);
			if (!res.ok) { error = 'Search failed. Try again.'; return; }
			const data = await res.json();
			/** @type {Array<{properties: {name?: string, street?: string, city?: string, country?: string}, geometry: {coordinates: [number, number]}}>} */
			const features = data.features ?? [];
			searchResults = features.map((f) => ({
				name: f.properties.name || f.properties.street || 'Unknown',
				place_name: [f.properties.name, f.properties.street, f.properties.city, f.properties.country].filter(Boolean).join(', '),
				lat: f.geometry.coordinates[1],
				lng: f.geometry.coordinates[0]
			}));
			if (searchResults.length === 0) error = 'No results found.';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			searchResults = [];
			error = 'Search failed. Try again.';
		}
	}

	async function submitSearch() {
		if (!searchSelected) return;
		submitting = true;
		error = '';
		try {
			const day = new Date(searchDate);
			const start = day.toISOString();
			const end = day.toISOString();
			await postVisits([{
				lat: searchSelected.lat,
				lng: searchSelected.lng,
				name: searchSelected.name,
				start,
				end,
				dwellMinutes: 0,
				confidence: 0.5,
				source: 'manual'
			}]);
		} finally {
			submitting = false;
		}
	}

	// --- Shared ---

	/**
	 * Reverse-geocode a point to a place name via Mapbox.
	 * @param {number} lat @param {number} lng
	 * @returns {Promise<string|null>}
	 */
	async function reverseName(lat, lng) {
		try {
			const res = await fetch(
				`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=poi,address&limit=1&access_token=${MAPBOX_TOKEN}`
			);
			if (!res.ok) return null;
			const data = await res.json();
			return data.features?.[0]?.text ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * POST visits to /api/visit, then close and call onDone.
	 * @param {Array<{lat: number, lng: number, name: string|null, start: string, end: string, dwellMinutes: number, confidence: number, source: string}>} visits
	 */
	async function postVisits(visits) {
		const res = await fetch('/api/visit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ visits })
		});
		if (!res.ok) {
			error = 'Something went wrong. Try again.';
			return;
		}
		close();
		onDone();
	}
</script>

<dialog bind:this={dialog}>
	<article>
		<header>
			<button class="close" aria-label="Close" onclick={close}></button>
			<h3>Wuz Here</h3>
		</header>

		<nav class="wuz-tabs">
			<button class="wuz-tab" class:active={activeTab === 'gps'} onclick={() => { activeTab = 'gps'; error = ''; }}>GPS</button>
			<button class="wuz-tab" class:active={activeTab === 'photo'} onclick={() => { activeTab = 'photo'; error = ''; }}>Photo</button>
			<button class="wuz-tab" class:active={activeTab === 'search'} onclick={() => { activeTab = 'search'; error = ''; }}>Search</button>
		</nav>

		{#if activeTab === 'gps'}
			<div class="tab-content">
				{#if !gpsPlace}
					<p class="hint">Tap below to mark your current location.</p>
					<button onclick={locateNow} disabled={gpsLocating} aria-busy={gpsLocating}>
						{gpsLocating ? 'Locating…' : 'Wuz Here'}
					</button>
				{:else}
					<div class="place-preview">
						<strong>{gpsPlace.name ?? 'Unknown place'}</strong>
						<span class="coords">{gpsPlace.lat.toFixed(5)}, {gpsPlace.lng.toFixed(5)}</span>
					</div>
					<div class="actions">
						<button onclick={submitGps} disabled={submitting} aria-busy={submitting}>Confirm</button>
						<button class="outline secondary" onclick={() => gpsPlace = null}>Retry</button>
					</div>
				{/if}
			</div>

		{:else if activeTab === 'photo'}
			<div class="tab-content">
				{#if photoPlaces.length === 0}
					<p class="hint">Select photos to extract GPS location and date from their metadata. Photos are read locally — nothing is uploaded.</p>
					<button onclick={() => photoInput.click()} disabled={photoProcessing} aria-busy={photoProcessing}>
						{photoProcessing ? 'Reading photos…' : 'Choose Photos'}
					</button>
					{#if photosSkipped > 0}
						<p class="hint muted">{photosSkipped} photo{photosSkipped !== 1 ? 's' : ''} had no GPS data and were skipped.</p>
					{/if}
				{:else}
					{#if photosSkipped > 0}
						<p class="hint muted">{photosSkipped} photo{photosSkipped !== 1 ? 's' : ''} skipped (no GPS data).</p>
					{/if}
					<ul class="place-list">
						{#each photoPlaces as place, i (i)}
							{#if !place.removing}
								<li>
									<div class="place-row">
										<div>
											<strong>{place.name ?? 'Unknown place'}</strong>
											<span class="place-meta">{place.photoCount} photo{place.photoCount !== 1 ? 's' : ''} · {place.start.toLocaleDateString()}</span>
										</div>
										<button class="outline secondary small" onclick={() => place.removing = true}>✕</button>
									</div>
								</li>
							{/if}
						{/each}
					</ul>
					<div class="actions">
						<button onclick={submitPhotos} disabled={submitting || photoPlaces.every(p => p.removing)} aria-busy={submitting}>
							Add {photoPlaces.filter(p => !p.removing).length} place{photoPlaces.filter(p => !p.removing).length !== 1 ? 's' : ''}
						</button>
						<button class="outline secondary" onclick={() => { photoPlaces = []; photosSkipped = 0; }}>Start over</button>
					</div>
				{/if}
			</div>

		{:else if activeTab === 'search'}
			<div class="tab-content">
				<input
					type="search"
					placeholder="Search by place name…"
					bind:value={searchQuery}
					oninput={onSearchInput}
				/>
				{#if searchResults.length > 0 && !searchSelected}
					<ul class="search-results">
						{#each searchResults as result}
							<li>
								<button class="result-item" onclick={() => { searchSelected = result; searchResults = []; searchQuery = result.place_name; }}>
									<strong>{result.name}</strong>
									<span class="place-meta">{result.place_name}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if searchSelected}
					<label>
						Date visited
						<input type="date" bind:value={searchDate} max={new Date().toISOString().slice(0, 10)} />
					</label>
					<div class="actions">
						<button onclick={submitSearch} disabled={submitting} aria-busy={submitting}>Confirm</button>
						<button class="outline secondary" onclick={() => { searchSelected = null; searchQuery = ''; }}>Clear</button>
					</div>
				{/if}
			</div>
		{/if}

		{#if error}
			<p class="wuz-error">{error}</p>
		{/if}
	</article>
</dialog>

<input bind:this={photoInput} type="file" accept="image/*" multiple onchange={handlePhotos} />

<style>
	dialog article {
		max-width: 26rem;
		width: 90vw;
	}

	.wuz-tabs {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 1.25rem;
	}

	.wuz-tab {
		--pico-form-element-spacing-vertical: 0.2rem;
		--pico-form-element-spacing-horizontal: 0.65rem;
		margin: 0;
		font-size: 0.8rem;
		background: none;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		color: var(--pico-muted-color);
		white-space: nowrap;
	}

	.wuz-tab.active {
		color: var(--pico-primary);
		border-color: var(--pico-primary);
		background: var(--pico-primary-background);
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--pico-muted-color);
		margin: 0;
	}

	.place-preview {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.75rem;
		background: var(--pico-card-background-color);
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.coords {
		font-size: 0.75rem;
		color: var(--pico-muted-color);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		margin: 0;
		flex: 1;
	}

	.place-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 16rem;
		overflow-y: auto;
	}

	.place-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		background: var(--pico-card-background-color);
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.place-meta {
		display: block;
		font-size: 0.75rem;
		color: var(--pico-muted-color);
	}

	button.small {
		--pico-form-element-spacing-vertical: 0.15rem;
		--pico-form-element-spacing-horizontal: 0.4rem;
		font-size: 0.75rem;
		margin: 0;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--pico-muted-border-color);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.result-item {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-bottom: 1px solid var(--pico-muted-border-color);
		border-radius: 0;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		margin: 0;
		cursor: pointer;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.muted {
		color: var(--pico-muted-color);
	}

	.wuz-error {
		color: var(--pico-del-color);
		font-size: 0.875rem;
		margin: 0.5rem 0 0;
	}

	input[type='file'] {
		display: none;
	}
</style>
