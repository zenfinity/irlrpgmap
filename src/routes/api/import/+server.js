import { sql } from '$lib/server/db';
import { parseVisits } from '$lib/parseVisits.js';
import { json, error } from '@sveltejs/kit';
import { VITE_MAPBOX_TOKEN } from '$env/static/private';

export async function DELETE({ locals }) {
	const userId = locals.user?.id;
	if (!userId) error(401, 'Not signed in');

	await sql`DELETE FROM visits WHERE user_id = ${userId}`;
	await sql`DELETE FROM import_log WHERE user_id = ${userId}`;
	return json({ ok: true });
}

/**
 * Reverse-geocode a unique set of locations to neighborhood names.
 * Deduplicates by placeId (or lat/lng key for places without one).
 * @param {Array<{placeId: string|null, lat: number, lng: number}>} visits
 * @returns {Promise<Map<string, string|null>>} key → neighborhood name or null
 */
async function geocodeNeighborhoods(visits) {
	/** @type {Map<string, {lat: number, lng: number}>} */
	const unique = new Map();
	for (const v of visits) {
		const key = v.placeId ?? `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
		if (!unique.has(key)) unique.set(key, { lat: v.lat, lng: v.lng });
	}

	/** @type {Map<string, string|null>} */
	const results = new Map();

	await Promise.all(
		[...unique.entries()].map(async ([key, { lat, lng }]) => {
			try {
				const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood&access_token=${VITE_MAPBOX_TOKEN}`;
				const res = await fetch(url);
				if (!res.ok) { results.set(key, null); return; }
				const data = await res.json();
				const name = data.features?.[0]?.text ?? null;
				results.set(key, name);
			} catch {
				results.set(key, null);
			}
		})
	);

	return results;
}

const BATCH_SIZE = 500;

export async function POST({ request, locals }) {
	const userId = locals.user?.id;
	if (!userId) error(401, 'Not signed in');

	const filename = request.headers.get('x-filename') ?? 'unknown';

	let takeoutJson;
	try {
		takeoutJson = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	let visits;
	try {
		visits = parseVisits(takeoutJson);
	} catch {
		error(400, 'Could not parse Takeout data — is this a Semantic Location History file?');
	}

	if (visits.length === 0) {
		return json({ imported: 0 });
	}

	const neighborhoodMap = await geocodeNeighborhoods(visits);

	/** @param {typeof visits[0]} v */
	const getNeighborhood = (v) => {
		const key = v.placeId ?? `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
		return neighborhoodMap.get(key) ?? null;
	};

	let imported = 0;
	for (let i = 0; i < visits.length; i += BATCH_SIZE) {
		const batch = visits.slice(i, i + BATCH_SIZE);

		const rows = await sql`
			INSERT INTO visits (user_id, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, source, knowledge_type, neighborhood)
			SELECT ${userId}, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, 'google_takeout', 'explored', neighborhood
			FROM unnest(
				${batch.map((v) => v.lat)}::float8[],
				${batch.map((v) => v.lng)}::float8[],
				${batch.map((v) => v.name)}::text[],
				${batch.map((v) => v.placeId)}::text[],
				${batch.map((v) => v.start)}::timestamptz[],
				${batch.map((v) => v.end)}::timestamptz[],
				${batch.map((v) => v.dwellMinutes)}::float8[],
				${batch.map((v) => v.confidence)}::float8[],
				${batch.map((v) => getNeighborhood(v))}::text[]
			) AS t(lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, neighborhood)
			ON CONFLICT DO NOTHING
			RETURNING id
		`;
		imported += rows.length;
	}

	await sql`
		INSERT INTO import_log (user_id, filename, imported_count)
		VALUES (${userId}, ${filename}, ${imported})
	`;

	return json({ imported });
}
