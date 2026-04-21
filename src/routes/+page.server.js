import { sql } from '$lib/server/db';
import { computeFamiliarity } from '$lib/parseVisits.js';

export async function load({ locals }) {
	const userId = locals.user?.id;
	if (!userId) return { places: [], neighborhoods: [], user: null, importLog: [] };
	const user = locals.user;

	const [rows, nbRows, importLog] = await Promise.all([
		sql`
			SELECT lat, lng, name, place_id, dwell_minutes, confidence, neighborhood
			FROM visits
			WHERE user_id = ${userId}
		`,
		sql`
			SELECT
				v.neighborhood AS name,
				ST_AsGeoJSON(n.polygon)::json AS polygon,
				CASE WHEN n.polygon IS NOT NULL THEN
					ROUND((
						ST_Area(ST_Transform(ST_ConvexHull(ST_Collect(ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326))), 3857)) /
						NULLIF(ST_Area(ST_Transform(n.polygon, 3857)), 0) * 100
					)::numeric, 1)
				ELSE NULL END AS completion_pct,
				AVG(v.lat)::float8 AS centroid_lat,
				AVG(v.lng)::float8 AS centroid_lng,
				COUNT(*)::int AS visit_count
			FROM visits v
			LEFT JOIN neighborhoods n ON n.name = v.neighborhood
			WHERE v.user_id = ${userId} AND v.neighborhood IS NOT NULL
			GROUP BY v.neighborhood, n.polygon
		`,
		sql`
			SELECT filename, imported_count, imported_at
			FROM import_log
			WHERE user_id = ${userId}
			ORDER BY imported_at DESC
		`
	]);

	const visits = rows.map((r) => ({
		lat: r.lat,
		lng: r.lng,
		name: r.name,
		placeId: r.place_id,
		dwellMinutes: r.dwell_minutes,
		confidence: r.confidence,
		neighborhood: r.neighborhood ?? null,
		start: new Date(0),
		end: new Date(0)
	}));

	const places = computeFamiliarity(visits);

	const neighborhoods = nbRows.map((r) => ({
		name: /** @type {string} */ (r.name),
		polygon: /** @type {{type: string, coordinates: any}|null} */ (r.polygon ?? null),
		completionPct: r.completion_pct != null ? Number(r.completion_pct) : null,
		centroidLat: Number(r.centroid_lat),
		centroidLng: Number(r.centroid_lng),
		visitCount: Number(r.visit_count)
	}));

	return { places, neighborhoods, user, importLog };
}
