/**
 * Shared server-auth construction types. Inputs are the concrete DB factory
 * used by the Worker runtime; outputs are narrow aliases used by the auth
 * option, hook, and plugin builders so they can stay split without duplicating
 * database type plumbing.
 */
import type { createDb } from "../../db/client";

export type AuthDatabase = ReturnType<typeof createDb>;
