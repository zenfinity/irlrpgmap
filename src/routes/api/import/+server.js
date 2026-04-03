import { sql } from '$lib/server/db';
import { parseVisits } from '$lib/parseVisits.js';
import { json, error } from '@sveltejs/kit';

export async function DELETE({ cookies }) {
	const userId = cookies.get('userId');
	if (!userId) return json({ deleted: 0 });

	const result = await sql`DELETE FROM visits WHERE user_id = ${userId}`;
	return json({ deleted: result.count });
}

const BATCH_SIZE = 500;

export async function POST({ request }) {
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

	const [user] = await sql`INSERT INTO users DEFAULT VALUES RETURNING id`;

	for (let i = 0; i < visits.length; i += BATCH_SIZE) {
		const batch = visits.slice(i, i + BATCH_SIZE);

		await sql`
			INSERT INTO visits (user_id, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, source, knowledge_type)
			SELECT ${user.id}::uuid, lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence, 'google_takeout', 'explored'
			FROM unnest(
				${batch.map((v) => v.lat)}::float8[],
				${batch.map((v) => v.lng)}::float8[],
				${batch.map((v) => v.name)}::text[],
				${batch.map((v) => v.placeId)}::text[],
				${batch.map((v) => v.start)}::timestamptz[],
				${batch.map((v) => v.end)}::timestamptz[],
				${batch.map((v) => v.dwellMinutes)}::float8[],
				${batch.map((v) => v.confidence)}::float8[]
			) AS t(lat, lng, name, place_id, start_time, end_time, dwell_minutes, confidence)
		`;
	}

	return json({ imported: visits.length, userId: user.id }, {
		headers: {
			'Set-Cookie': `userId=${user.id}; Path=/; SameSite=Lax; Max-Age=31536000`
		}
	});
}
