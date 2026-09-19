/**
 * Preloaded (see `bunfig.toml`) before any test file, and before any of them
 * can import `~/env` transitively through `~/server/db`. `??=` keeps whatever
 * Bun already loaded from `.env` — this project's real local Postgres, since
 * there is no separate test database yet — and only fills in a value when one
 * is missing, e.g. in CI.
 */
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.DATABASE_URL ??=
	"postgres://postgres:password@localhost:5464/desarrollo-de-software-con-ia";
process.env.DEEPSEEK_API_KEY ??= "test-key";
