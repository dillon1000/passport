import { readDevVars } from "./migrate.mjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const devVars = readDevVars(process.cwd());
const url = process.env.PROD_DATABASE_URL?.trim() || devVars.PROD_DATABASE_URL?.trim();
if (!url) {
	console.error("no PROD_DATABASE_URL");
	process.exit(2);
}
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);
try {
	await migrate(db, { migrationsFolder: "./drizzle" });
	console.log("migrations applied OK");
} catch (e) {
	console.error("MIGRATION ERROR:", e);
	process.exitCode = 1;
} finally {
	await sql.end();
}
