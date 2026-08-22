/**
 * Strongly consistent storage for Better Auth. Each request routes by key to
 * one of a fixed number of Durable Object shards. The object stores values and
 * expiration times in SQLite, and it exposes the atomic consume and increment
 * operations required by Better Auth 1.7.
 */
import { DurableObject } from "cloudflare:workers";

type StoredValue = {
	value: string;
	expiresAt: number | null;
};

type IncrementedValue = {
	value: number;
};

type NextExpiration = {
	expiresAt: number | null;
};

export class AuthSecondaryStorage extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS auth_values (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					expires_at INTEGER
				);
				CREATE INDEX IF NOT EXISTS auth_values_expires_at
				ON auth_values (expires_at);
			`);
		});
	}

	/** Return a live value, deleting it first when its TTL has elapsed. */
	getValue(key: string): string | null {
		this.deleteExpiredValue(key);
		return this.ctx.storage.sql
			.exec<StoredValue>(
				"SELECT value, expires_at AS expiresAt FROM auth_values WHERE key = ?",
				key,
			)
			.toArray()[0]?.value ?? null;
	}

	/** Store a value and schedule shard cleanup when Better Auth supplies a TTL. */
	async setValue(key: string, value: string, ttl?: number): Promise<void> {
		const expiresAt = ttl === undefined
			? null
			: Date.now() + Math.max(1, Math.ceil(ttl)) * 1_000;
		this.ctx.storage.sql.exec(
			`INSERT INTO auth_values (key, value, expires_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT (key) DO UPDATE SET
			 value = excluded.value,
			 expires_at = excluded.expires_at`,
			key,
			value,
			expiresAt,
		);
		await this.scheduleNextExpiration();
	}

	/** Remove a value. A stale alarm is harmless and will reschedule itself. */
	deleteValue(key: string): void {
		this.ctx.storage.sql.exec("DELETE FROM auth_values WHERE key = ?", key);
	}

	/** Return and delete one value within the same SQLite transaction. */
	getAndDeleteValue(key: string): string | null {
		this.deleteExpiredValue(key);
		return this.ctx.storage.sql
			.exec<StoredValue>(
				"DELETE FROM auth_values WHERE key = ? RETURNING value, expires_at AS expiresAt",
				key,
			)
			.toArray()[0]?.value ?? null;
	}

	/**
	 * Increment one counter atomically. The supplied TTL starts only when the
	 * counter is created or recreated after expiry, so requests share one fixed
	 * rate-limit window.
	 */
	async incrementValue(key: string, ttl: number): Promise<number> {
		const now = Date.now();
		const expiresAt = now + Math.max(1, Math.ceil(ttl)) * 1_000;
		const result = this.ctx.storage.sql
			.exec<IncrementedValue>(
				`INSERT INTO auth_values (key, value, expires_at)
				 VALUES (?, '1', ?)
				 ON CONFLICT (key) DO UPDATE SET
				 value = CASE
				 	WHEN auth_values.expires_at IS NOT NULL AND auth_values.expires_at <= ? THEN '1'
				 	ELSE CAST(CAST(auth_values.value AS INTEGER) + 1 AS TEXT)
				 END,
				 expires_at = CASE
				 	WHEN auth_values.expires_at IS NOT NULL AND auth_values.expires_at <= ? THEN excluded.expires_at
				 	ELSE auth_values.expires_at
				 END
				 RETURNING CAST(value AS INTEGER) AS value`,
				key,
				expiresAt,
				now,
				now,
			)
			.one();
		await this.scheduleNextExpiration();
		return result.value;
	}

	/** Delete expired shard values and schedule the next cleanup. */
	async alarm(): Promise<void> {
		this.ctx.storage.sql.exec(
			"DELETE FROM auth_values WHERE expires_at IS NOT NULL AND expires_at <= ?",
			Date.now(),
		);
		await this.scheduleNextExpiration();
	}

	private deleteExpiredValue(key: string): void {
		this.ctx.storage.sql.exec(
			"DELETE FROM auth_values WHERE key = ? AND expires_at IS NOT NULL AND expires_at <= ?",
			key,
			Date.now(),
		);
	}

	private async scheduleNextExpiration(): Promise<void> {
		const { expiresAt } = this.ctx.storage.sql
			.exec<NextExpiration>(
				"SELECT MIN(expires_at) AS expiresAt FROM auth_values WHERE expires_at IS NOT NULL",
			)
			.one();
		if (expiresAt === null) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		await this.ctx.storage.setAlarm(expiresAt);
	}
}
