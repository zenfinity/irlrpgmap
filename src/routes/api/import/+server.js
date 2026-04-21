import { sql } from '$lib/server/db';
import { parseVisits } from '$lib/parseVisits.js';
import { geocodeNeighborhoods, geocodeKey } from '$lib/server/geocode.js';
import { json, error } from '@sveltejs/kit';

export async function DELETE({ locals }) {
	const userId = locals.user?.id;
	if (!userId) error(401, 'Not signed in');

	await sql`DELETE FROM visits WHERE user_id = ${userId}`;
	await sql`DELETE FROM import_log WHERE user_id = ${userId}`;
	return json({ ok: true });
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
	const getNeighborhood = (v) => neighborhoodMap.get(geocodeKey(v.placeId, v.lat, v.lng)) ?? null;

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
