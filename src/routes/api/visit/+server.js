import { sql } from '$lib/server/db';
import { geocodeNeighborhoods, geocodeKey } from '$lib/server/geocode.js';
import { json, error } from '@sveltejs/kit';

/**
 * @typedef {{ lat: number, lng: number, name: string|null, start: string, end: string, dwellMinutes: number, confidence: number, source: string }} VisitInput
 */

export async function POST({ request, locals }) {
	const userId = locals.user?.id;
	if (!userId) error(401, 'Not signed in');

	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	/** @type {VisitInput[]} */
	const visits = body.visits;
	if (!Array.isArray(visits) || visits.length === 0) error(400, 'No visits provided');

	const geocodeMap = await geocodeNeighborhoods(visits.map((v) => ({ placeId: null, lat: v.lat, lng: v.lng })));

	const rows = await sql`
		INSERT INTO visits (user_id, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, source, knowledge_type, neighborhood)
		SELECT ${userId}, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, source, 'explored', neighborhood
		FROM unnest(
			${visits.map((v) => v.lat)}::float8[],
			${visits.map((v) => v.lng)}::float8[],
			${visits.map((v) => v.name ?? null)}::text[],
			${visits.map(() => null)}::text[],
			${visits.map((v) => v.start)}::timestamptz[],
			${visits.map((v) => v.end)}::timestamptz[],
			${visits.map((v) => v.dwellMinutes)}::float8[],
			${visits.map((v) => v.confidence)}::float8[],
			${visits.map((v) => v.source ?? 'manual')}::text[],
			${visits.map((v) => geocodeMap.get(geocodeKey(null, v.lat, v.lng))?.neighborhood ?? null)}::text[]
		) AS t(lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, source, neighborhood)
		ON CONFLICT DO NOTHING
		RETURNING id
	`;

	return json({ imported: rows.length });
}
