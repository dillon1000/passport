ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE
	WHEN "provider_id" = 'credential' THEN 'local:credential'
	WHEN "provider_id" IN ('github', 'discord', 'twitter') THEN 'local:oauth:' || "provider_id"
	ELSE NULL
END;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
		RAISE EXCEPTION 'Account issuer backfill requires an explicit provider mapping';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "account"
		GROUP BY "issuer", "account_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Account issuer backfill found duplicate provider identities';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");
