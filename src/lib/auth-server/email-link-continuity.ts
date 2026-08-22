/**
 * Cross-device email-link continuity plugin. The waiting browser creates a
 * short-lived flow, an email callback completes it, and the waiting browser
 * consumes it to receive its own session or password-reset continuation.
 */
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { and, eq, gt, like, lt } from "drizzle-orm";
import * as z from "zod";

import { verification as verificationTable } from "../../db/schema";
import type { AuthDatabase } from "./types";

const EMAIL_LINK_FLOW_PREFIX = "passport-email-link:";
const EMAIL_LINK_FLOW_TTL_MS = 60 * 60 * 1_000;

const emailLinkKindSchema = z.enum(["magic-link", "verification", "password-reset"]);
const startBodySchema = z.object({
	kind: emailLinkKindSchema,
	destination: z.string().min(1),
});
const flowQuerySchema = z.object({
	flow: z.string().length(64),
	token: z.string().optional(),
});
const storedFlowSchema = z.object({
	kind: emailLinkKindSchema,
	destination: z.string().min(1),
	state: z.enum(["pending", "complete"]),
	userId: z.string().optional(),
	resetToken: z.string().optional(),
});

type StoredEmailLinkFlow = z.infer<typeof storedFlowSchema>;

function createFlowToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function flowIdentifier(flow: string) {
	return `${EMAIL_LINK_FLOW_PREFIX}${flow}`;
}

function sameOriginDestination(value: string, baseURL: string) {
	const base = new URL(baseURL);
	const destination = new URL(value, base);
	if (destination.origin !== base.origin) return null;
	return `${destination.pathname}${destination.search}${destination.hash}`;
}

function continuationDestination(flow: StoredEmailLinkFlow) {
	const destination = new URL(flow.destination, "https://passport.invalid");
	if (flow.kind === "password-reset" && flow.resetToken) {
		destination.searchParams.set("token", flow.resetToken);
	}
	return `${destination.pathname}${destination.search}${destination.hash}`;
}

function consumingDeviceDestination(flow: StoredEmailLinkFlow) {
	return flow.kind === "password-reset"
		? continuationDestination(flow)
		: "/sign-in?emailLinkConsumed=1";
}

async function findFlow(db: AuthDatabase, flow: string) {
	const [row] = await db
		.select({ value: verificationTable.value })
		.from(verificationTable)
		.where(
			and(
				eq(verificationTable.identifier, flowIdentifier(flow)),
				gt(verificationTable.expiresAt, new Date()),
			),
		)
		.limit(1);
	if (!row) return null;
	const parsed = storedFlowSchema.safeParse(JSON.parse(row.value));
	return parsed.success ? parsed.data : null;
}

/**
 * Adds the start, callback, and polling endpoints for cross-device email links.
 * Flow records use Better Auth's verification table and expire after one hour.
 */
export function emailLinkContinuity(db: AuthDatabase) {
	return {
		id: "email-link-continuity",
		endpoints: {
			startEmailLinkFlow: createAuthEndpoint(
				"/email-link/start",
				{ method: "POST", body: startBodySchema },
				async (ctx) => {
					const destination = sameOriginDestination(ctx.body.destination, ctx.context.baseURL);
					if (!destination) {
						throw ctx.error("BAD_REQUEST", { message: "Email-link destination must use this origin." });
					}

					const now = new Date();
					await db
						.delete(verificationTable)
						.where(
							and(
								like(verificationTable.identifier, `${EMAIL_LINK_FLOW_PREFIX}%`),
								lt(verificationTable.expiresAt, now),
							),
						);

					const flow = createFlowToken();
					await db.insert(verificationTable).values({
						id: crypto.randomUUID(),
						identifier: flowIdentifier(flow),
						value: JSON.stringify({
							kind: ctx.body.kind,
							destination,
							state: "pending",
						} satisfies StoredEmailLinkFlow),
						expiresAt: new Date(now.getTime() + EMAIL_LINK_FLOW_TTL_MS),
					});

					return ctx.json({
						flow,
						callbackURL: `${ctx.context.baseURL}/email-link/consume?flow=${flow}`,
					});
				},
			),
			consumeEmailLinkFlow: createAuthEndpoint(
				"/email-link/consume",
				{ method: "GET", query: flowQuerySchema },
				async (ctx) => {
					const flow = await findFlow(db, ctx.query.flow);
					if (!flow || flow.state !== "pending") {
						throw ctx.error("BAD_REQUEST", { message: "Email-link flow is invalid or expired." });
					}

					let completed: StoredEmailLinkFlow;
					if (flow.kind === "password-reset") {
						if (!ctx.query.token) {
							throw ctx.error("BAD_REQUEST", { message: "Password-reset token is missing." });
						}
						completed = { ...flow, state: "complete", resetToken: ctx.query.token };
					} else {
						const session = await getSessionFromCtx(ctx);
						if (!session) {
							throw ctx.error("UNAUTHORIZED", { message: "Email-link session is missing." });
						}
						completed = { ...flow, state: "complete", userId: session.user.id };
					}

					const [updated] = await db
						.update(verificationTable)
						.set({ value: JSON.stringify(completed), updatedAt: new Date() })
						.where(
							and(
								eq(verificationTable.identifier, flowIdentifier(ctx.query.flow)),
								eq(verificationTable.value, JSON.stringify(flow)),
							),
						)
						.returning({ id: verificationTable.id });
					if (!updated) {
						throw ctx.error("BAD_REQUEST", { message: "Email-link flow was already consumed." });
					}

					ctx.setHeader("cache-control", "no-store");
					ctx.setHeader("referrer-policy", "no-referrer");
					throw ctx.redirect(consumingDeviceDestination(completed));
				},
			),
			pollEmailLinkFlow: createAuthEndpoint(
				"/email-link/poll",
				{ method: "GET", query: flowQuerySchema.pick({ flow: true }) },
				async (ctx) => {
					const flow = await findFlow(db, ctx.query.flow);
					ctx.setHeader("cache-control", "no-store");
					if (!flow) {
						return ctx.json({ status: "expired" as const }, { status: 410 });
					}
					if (flow.state === "pending") {
						return ctx.json({ status: "pending" as const }, { status: 202 });
					}

					const [claimed] = await db
						.delete(verificationTable)
						.where(eq(verificationTable.identifier, flowIdentifier(ctx.query.flow)))
						.returning({ id: verificationTable.id });
					if (!claimed) {
						return ctx.json({ status: "expired" as const }, { status: 410 });
					}

					if (flow.kind !== "password-reset") {
						if (!flow.userId) {
							throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Email-link user is missing." });
						}
						const user = await ctx.context.internalAdapter.findUserById(flow.userId);
						if (!user) {
							throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Could not continue email-link session." });
						}
						const session = await ctx.context.internalAdapter.createSession(flow.userId);
						if (!session) {
							throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Could not continue email-link session." });
						}
						await setSessionCookie(ctx, { session, user });
					}

					return ctx.json({
						status: "complete" as const,
						destination: continuationDestination(flow),
					});
				},
			),
			cancelEmailLinkFlow: createAuthEndpoint(
				"/email-link/cancel",
				{ method: "DELETE", query: flowQuerySchema.pick({ flow: true }) },
				async (ctx) => {
					await db
						.delete(verificationTable)
						.where(eq(verificationTable.identifier, flowIdentifier(ctx.query.flow)));
					return ctx.json({ status: true });
				},
			),
		},
		rateLimit: [
			{
				pathMatcher: (path) => path.startsWith("/email-link/start"),
				window: 60,
				max: 20,
			},
			{
				pathMatcher: (path) => path.startsWith("/email-link/poll"),
				window: 60,
				max: 120,
			},
		],
	} satisfies BetterAuthPlugin;
}
