import { sql } from '$lib/server/db';
import { computeFamiliarity } from '$lib/parseVisits.js';

export async function load({ cookies }) {
	const userId = cookies.get('userId');
	if (!userId) return { places: [] };

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

	return { places: computeFamiliarity(visits) };
}
