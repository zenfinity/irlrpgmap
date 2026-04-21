import { sql } from '$lib/server/db';
import { json, error } from '@sveltejs/kit';

export async function GET({ params, locals }) {
	const userId = locals.user?.id;
	if (!userId) error(401, 'Not signed in');

	const name = params.name;

	// Check if we already have the polygon cached
	let [neighborhood] = await sql`
		SELECT ST_AsGeoJSON(polygon)::json AS polygon
		FROM neighborhoods
		WHERE name = ${name}
	`;

	if (!neighborhood) {
		// First time — fetch from Nominatim using the centroid of the user's visits
		const [centroid] = await sql`
			SELECT AVG(lat) AS lat, AVG(lng) AS lng
			FROM visits
			WHERE user_id = ${userId} AND neighborhood = ${name}
		`;

		let polygon = null;

		if (centroid?.lat && centroid?.lng) {
			try {
				const res = await fetch(
					`https://nominatim.openstreetmap.org/reverse?lat=${centroid.lat}&lon=${centroid.lng}&format=geojson&zoom=14&polygon_geojson=1`,
					{ headers: { 'User-Agent': 'irlrpgmap/1.0 (https://github.com/zenfinity/irlrpgmap)' } }
				);
				if (res.ok) {
					const data = await res.json();
					const geometry = data.features?.[0]?.geometry;
					if (geometry) polygon = geometry;
				}
			} catch {
				// Nominatim unavailable — proceed without polygon
			}
		}

		// Upsert into neighborhoods table (polygon may be null)
		if (polygon) {
			await sql`
				INSERT INTO neighborhoods (name, polygon)
				VALUES (${name}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(polygon)}), 4326))
				ON CONFLICT (name) DO UPDATE SET polygon = EXCLUDED.polygon
			`;
		} else {
			await sql`
				INSERT INTO neighborhoods (name, polygon)
				VALUES (${name}, NULL)
				ON CONFLICT (name) DO NOTHING
			`;
		}

		neighborhood = { polygon };
	}

	// Compute user's convex hull and completion %
	const [stats] = await sql`
		SELECT
			ST_AsGeoJSON(
				ST_ConvexHull(ST_Collect(ST_SetSRID(ST_MakePoint(lng, lat), 4326)))
			)::json AS user_polygon,
			CASE WHEN n.polygon IS NOT NULL THEN
				ROUND((
					ST_Area(ST_Transform(ST_ConvexHull(ST_Collect(ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326))), 3857)) /
					NULLIF(ST_Area(ST_Transform(n.polygon, 3857)), 0) * 100
				)::numeric, 1)
			ELSE NULL END AS completion_pct
		FROM visits v, neighborhoods n
		WHERE v.user_id = ${userId} AND v.neighborhood = ${name} AND n.name = ${name}
		GROUP BY n.polygon
	`;

	return json({
		polygon: neighborhood.polygon ?? null,
		userPolygon: stats?.user_polygon ?? null,
		completionPct: stats?.completion_pct ? Number(stats.completion_pct) : null
	});
}
