import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";
import type { AuthEnv } from "../env";

export function createDb(env: AuthEnv) {
	return drizzle(env.DB, { schema });
}
