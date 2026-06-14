import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import type { AuthEnv } from "../env";

export function createDb(env: AuthEnv) {
	const client = postgres(env.HYPERDRIVE.connectionString, {
		prepare: false,
	});

	return drizzle(client, { schema });
}
