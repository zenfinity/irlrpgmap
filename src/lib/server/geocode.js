import { VITE_MAPBOX_TOKEN } from '$env/static/private';

/**
 * Try Mapbox reverse geocode — returns the most granular neighborhood/locality
 * from the context hierarchy, or null if none found.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function geocodeViaMapbox(lat, lng) {
	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${VITE_MAPBOX_TOKEN}`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json();
	const ctx = data.features?.[0]?.context ?? [];
	const match = ctx.find(
		/** @param {{id: string, text: string}} c */
		(c) => c.id.startsWith('neighborhood.') || c.id.startsWith('locality.')
	);
	return match?.text ?? null;
}

/**
 * Fallback: Nominatim (OSM) reverse geocode — better coverage for commercial
 * and industrial areas that Mapbox doesn't have neighborhood data for.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function geocodeViaNominatim(lat, lng) {
	const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`;
	const res = await fetch(url, {
		headers: { 'User-Agent': 'irlrpgmap/1.0 (https://irlrpgmap.live)' }
	});
	if (!res.ok) return null;
	const data = await res.json();
	const addr = data.address ?? {};
	// Pick the most granular sub-city label available, including commercial/industrial zones
	return addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.city_district ?? addr.retail ?? addr.commercial ?? addr.industrial ?? null;
}

/**
 * Reverse-geocode a set of locations to neighborhood names.
 * Tries Mapbox first; falls back to Nominatim for any nulls.
 * Deduplicates by placeId (or rounded lat/lng for places without one).
 *
 * @param {Array<{placeId?: string|null, lat: number, lng: number}>} locations
 * @returns {Promise<Map<string, string|null>>} key → neighborhood name or null
 */
export async function geocodeNeighborhoods(locations) {
	/** @type {Map<string, {lat: number, lng: number}>} */
	const unique = new Map();
	for (const loc of locations) {
		const key = loc.placeId ?? `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
		if (!unique.has(key)) unique.set(key, { lat: loc.lat, lng: loc.lng });
	}

	/** @type {Map<string, string|null>} */
	const results = new Map();

	// Phase 1: try Mapbox for all locations in parallel
	await Promise.all(
		[...unique.entries()].map(async ([key, { lat, lng }]) => {
			try {
				results.set(key, await geocodeViaMapbox(lat, lng));
			} catch {
				results.set(key, null);
			}
		})
	);

	// Phase 2: Nominatim fallback for any that came back null — sequential to
	// respect the 1 req/sec policy
	for (const [key, val] of results) {
		if (val !== null) continue;
		const loc = unique.get(key);
		if (!loc) continue;
		try {
			results.set(key, await geocodeViaNominatim(loc.lat, loc.lng));
		} catch {
			// leave null
		}
		await new Promise((r) => setTimeout(r, 1100));
	}

	return results;
}

/**
 * Get the geocoding key for a location — matches the key used in geocodeNeighborhoods.
 * @param {string|null|undefined} placeId
 * @param {number} lat
 * @param {number} lng
 */
export function geocodeKey(placeId, lat, lng) {
	return placeId ?? `${lat.toFixed(4)},${lng.toFixed(4)}`;
}
