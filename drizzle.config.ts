import type { Config } from "drizzle-kit";

import { env } from "~/env";

export default {
	schema: "./src/server/db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL,
	},
	// `pgTableCreator` prefixes app tables with `pg-drizzle_`, not
	// `desarrollo-de-software-con-ia_`; Better Auth's tables (`user`, `session`,
	// `account`, `verification`) are plain `pgTable` with no prefix at all.
	// Both patterns must stay listed: on a Postgres instance shared across
	// worktrees, an empty or mismatched filter would let `db:push` propose
	// dropping tables this project doesn't own.
	tablesFilter: ["pg-drizzle_*", "user", "session", "account", "verification"],
} satisfies Config;
