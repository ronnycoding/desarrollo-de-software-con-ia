import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "~/server/db";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: true,
	},
	// Must be the last plugin: lets server actions set the session cookie.
	plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
