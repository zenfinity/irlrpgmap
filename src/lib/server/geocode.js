import { VITE_MAPBOX_TOKEN } from '$env/static/private';

/**
 * Reverse-geocode a set of locations to neighborhood names via Mapbox.
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

	await Promise.all(
		[...unique.entries()].map(async ([key, { lat, lng }]) => {
			try {
				const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood,locality&access_token=${VITE_MAPBOX_TOKEN}`;
				const res = await fetch(url);
				if (!res.ok) { results.set(key, null); return; }
				const data = await res.json();
				results.set(key, data.features?.[0]?.text ?? null);
			} catch {
				results.set(key, null);
			}
		})
	);

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
