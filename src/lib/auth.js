import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';
import { DATABASE_URL, BETTER_AUTH_URL } from '$env/static/private';

export const auth = betterAuth({
	baseURL: BETTER_AUTH_URL,
	database: new Pool({ connectionString: DATABASE_URL }),
	emailAndPassword: {
		enabled: true
	}
});
