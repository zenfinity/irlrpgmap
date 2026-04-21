import { sql } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST() {
	await sql`
		CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`;

	await sql`
		CREATE TABLE IF NOT EXISTS visits (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			lat DOUBLE PRECISION NOT NULL,
			lng DOUBLE PRECISION NOT NULL,
			name TEXT,
			place_id TEXT,
			start_time TIMESTAMPTZ,
			end_time TIMESTAMPTZ,
			dwell_minutes DOUBLE PRECISION,
			confidence DOUBLE PRECISION,
			source TEXT NOT NULL CHECK (source IN ('google_takeout', 'live', 'manual')),
			knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('explored', 'searched', 'heard_of')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`;

	await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS neighborhood TEXT`;

	await sql`CREATE EXTENSION IF NOT EXISTS postgis`;

	await sql`
		CREATE TABLE IF NOT EXISTS neighborhoods (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name TEXT NOT NULL UNIQUE,
			polygon GEOMETRY,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`;

	await sql`CREATE INDEX IF NOT EXISTS visits_user_id_idx ON visits (user_id)`;
	await sql`CREATE INDEX IF NOT EXISTS visits_place_id_idx ON visits (place_id)`;
	await sql`CREATE INDEX IF NOT EXISTS neighborhoods_name_idx ON neighborhoods (name)`;

	return json({ ok: true });
}
