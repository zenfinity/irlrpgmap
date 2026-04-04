import { sql } from '$lib/server/db';
import { computeFamiliarity } from '$lib/parseVisits.js';

export async function load({ locals }) {
	const userId = locals.user?.id;
	if (!userId) return { places: [], user: null, importLog: [] };
	const user = locals.user;

	const rows = await sql`
		SELECT lat, lng, name, place_id, dwell_minutes, confidence
		FROM visits
		WHERE user_id = ${userId}
	`;

	const visits = rows.map((r) => ({
		lat: r.lat,
		lng: r.lng,
		name: r.name,
		placeId: r.place_id,
		dwellMinutes: r.dwell_minutes,
		confidence: r.confidence,
		start: new Date(0),
		end: new Date(0)
	}));

	const importLog = await sql`
		SELECT filename, imported_count, imported_at
		FROM import_log
		WHERE user_id = ${userId}
		ORDER BY imported_at DESC
	`;

	return { places: computeFamiliarity(visits), user, importLog };
}
