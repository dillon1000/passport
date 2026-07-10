/**
 * Versioned delegated resource API. OAuth bearer requests are verified against
 * Passport's local RS256 keys and live grants, then routed into actor-aware
 * domain services. The same Zod schemas validate inputs and generate the public
 * OpenAPI document. Browser billing confirmation routes use Passport sessions
 * and never translate a bearer token into a cookie.
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";

import { auth } from "../src/auth";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { sendOrganizationInvitationEmail } from "../src/email";
import { parseOAuthClientSeeds, type AuthEnv } from "../src/env";
import {
	authorizeDelegatedClientRequest,
	authorizeDelegatedGrant,
	type DelegatedClientActor,
} from "../src/lib/client-api-auth";
import {
	ClientAPIError,
	clientAPIProtectedResourceMetadata,
	insufficientClientAPIScopeError,
} from "../src/lib/client-api-http";
import { enforceClientAPIRateLimit } from "../src/lib/client-api-rate-limit";
import {
	BillingActionIntentError,
	claimBillingActionIntent,
	cleanupBillingActionIntents,
	completeBillingActionIntent,
	createBillingActionIntent,
	failBillingActionIntent,
	getBillingActionIntent,
	type BillingAction,
	type BillingIntentClient,
} from "../src/lib/billing-action-intents";
import { billingPlanCatalogEntry, catalogPriceIds } from "../src/lib/billing";
import {
	getBillingPlanById,
	listBillingPlans,
	rowToDefinition,
} from "../src/lib/billing-plan-store";
import {
	createOneTimeCheckout,
	resolveStripePrices,
} from "../src/lib/auth-server/stripe";
import { DelegatedResourceError } from "../src/lib/delegated-resource-errors";
import {
	createDelegatedResourceService,
	type DelegatedResourceActor,
} from "../src/lib/delegated-resources";
import { hasLiveOrganizationPermission } from "../src/lib/organization-access";
import { createPassportImageAssetService } from "../src/lib/passport-image-assets";
import { requestIPAddress } from "../src/lib/request-metadata";
import { requestLocationFromRequest } from "../src/lib/request-location";
import { DELEGATED_CLIENT_API_SCOPES, OAUTH_SCOPE_DEFINITIONS } from "../src/lib/oauth-scopes";

type ClientAPIEnv = { Bindings: Env };
type ClientAPIContext = Context<ClientAPIEnv>;

const ErrorSchema = z.object({
	error: z.object({ code: z.string(), message: z.string() }),
});
const DataSchema = z.object({ data: z.unknown() });
const IDParams = z.object({ organizationId: z.string().min(1) });
const OrganizationItemParams = z.object({ organizationId: z.string().min(1) });
const InvitationParams = z.object({ invitationId: z.string().min(1) });
const OrganizationInvitationParams = z.object({
	organizationId: z.string().min(1),
	invitationId: z.string().min(1),
});
const OrganizationMemberParams = z.object({
	organizationId: z.string().min(1),
	memberId: z.string().min(1),
});
const TeamParams = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
});
const TeamMemberParams = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	userId: z.string().min(1),
});
const ProfilePatch = z
	.object({ name: z.string().min(1).max(255).optional(), username: z.string().max(255).nullable().optional() })
	.refine((value) => value.name !== undefined || value.username !== undefined, {
		message: "Provide name or username.",
	});
const OrganizationWrite = z.object({
	name: z.string().min(1).max(255),
	slug: z.string().min(1).max(255).optional(),
});
const OrganizationPatch = OrganizationWrite.partial().refine(
	(value) => value.name !== undefined || value.slug !== undefined,
	{ message: "Provide name or slug." },
);
const InvitationWrite = z.object({
	email: z.string().email(),
	role: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).default("member"),
	teamId: z.string().min(1).optional(),
});
const MemberPatch = z.object({
	role: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});
const TeamWrite = z.object({ name: z.string().min(1).max(255) });
const TeamMemberWrite = z.object({ userId: z.string().min(1) });
const ImageBody = z.object({
	file: z
		.custom<File>((value) => value instanceof File && value.size <= 2 * 1024 * 1024)
		.openapi({ type: "string", format: "binary" }),
});
const BillingTargetQuery = z.object({ organizationId: z.string().min(1).optional() });
const ProductParams = z.object({ productId: z.string().min(1) });
const SubscriptionParams = z.object({ subscriptionId: z.string().min(1) });
const IdempotencyHeaders = z.object({
	"Idempotency-Key": z.string().min(1).max(255),
});
const CheckoutIntentBody = z.object({
	productId: z.string().min(1),
	organizationId: z.string().min(1).optional(),
	annual: z.boolean().optional(),
	seats: z.number().int().positive().optional(),
	successUrl: z.string().url(),
	cancelUrl: z.string().url(),
});
const PortalIntentBody = z.object({
	organizationId: z.string().min(1).optional(),
	returnUrl: z.string().url(),
});
const SubscriptionIntentBody = z.object({ returnUrl: z.string().url() });

const commonErrors = {
	400: { description: "Invalid request", content: { "application/json": { schema: ErrorSchema } } },
	401: { description: "Invalid bearer token", content: { "application/json": { schema: ErrorSchema } } },
	403: { description: "Insufficient scope or live authority", content: { "application/json": { schema: ErrorSchema } } },
	404: { description: "Resource not found", content: { "application/json": { schema: ErrorSchema } } },
	409: { description: "Conflict", content: { "application/json": { schema: ErrorSchema } } },
	413: { description: "Image too large", content: { "application/json": { schema: ErrorSchema } } },
	429: { description: "Rate limited", content: { "application/json": { schema: ErrorSchema } } },
} as const;

function response(description = "Success") {
	return { description, content: { "application/json": { schema: DataSchema } } } as const;
}

function security(scope: string) {
	return [{ oauth2: [scope] }];
}

function delegatedActor(actor: DelegatedClientActor): DelegatedResourceActor {
	return {
		userID: actor.userId,
		clientID: actor.clientId,
		clientName: actor.clientName,
	};
}

function organizationSlug(name: string) {
	const slug = name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
	return slug || `organization-${crypto.randomUUID().slice(0, 8)}`;
}

async function authorize(
	c: ClientAPIContext,
	options: { requiredScopes?: readonly string[]; anyScope?: readonly string[]; sensitive?: boolean } = {},
) {
	const env = c.env as AuthEnv;
	const actor = await authorizeDelegatedClientRequest(env, createDb(env), {
		authorization: c.req.header("authorization"),
		requiredScopes: options.requiredScopes,
	});
	if (options.anyScope?.length && !options.anyScope.some((scope) => actor.scopes.includes(scope))) {
		throw insufficientClientAPIScopeError(env.BETTER_AUTH_URL, options.anyScope);
	}
	const limit = await enforceClientAPIRateLimit(env.AUTH_SECONDARY_STORAGE, actor, {
		sensitive: options.sensitive,
	});
	for (const [name, value] of limit.headers) c.header(name, value);
	return actor;
}

function resourceService(c: ClientAPIContext) {
	const env = c.env as AuthEnv;
	const db = createDb(env);
	const request = c.req.raw;
	return createDelegatedResourceService({
		db,
		origin: env.BETTER_AUTH_URL,
		images: createPassportImageAssetService({
			origin: env.BETTER_AUTH_URL,
			storage: env.PROFILE_IMAGES,
		}),
		onMutation: async (actor, mutation) => {
			await db.insert(schema.accountActivityEvent).values({
				id: crypto.randomUUID(),
				userId: actor.userID,
				type: "connected_app_action",
				ipAddress: requestIPAddress(request),
				location: requestLocationFromRequest(request),
				userAgent: request.headers.get("user-agent"),
				metadata: JSON.stringify({
					clientId: actor.clientID,
					clientName: actor.clientName,
					action: mutation.action,
					targetType: mutation.targetType,
					...(mutation.targetID ? { targetId: mutation.targetID } : {}),
					...(mutation.organizationID ? { organizationId: mutation.organizationID } : {}),
					...(mutation.metadata ?? {}),
				}),
			});
		},
		sendInvitation: async (delivery) => {
			const url = new URL("/organization/invitation", env.BETTER_AUTH_URL);
			url.searchParams.set("id", delivery.id);
			await sendOrganizationInvitationEmail(
				env,
				delivery.email,
				delivery.organizationName,
				delivery.inviterName,
				url.toString(),
			);
		},
	});
}

function noContent() {
	return new Response(null, { status: 204 });
}

function defaultValidationHook(
	result: { success: boolean; error?: { issues?: Array<{ message?: string }> } },
	c: ClientAPIContext,
) {
	if (result.success) return;
	return c.json(
		{
			error: {
				code: "invalid_request",
				message: result.error?.issues?.[0]?.message ?? "Request validation failed.",
			},
		},
		400,
	);
}

async function registeredBillingClient(
	env: AuthEnv,
	db: ReturnType<typeof createDb>,
	clientId: string,
): Promise<BillingIntentClient & { name: string }> {
	const [client] = await db
		.select({
			clientId: schema.oauthClient.clientId,
			name: schema.oauthClient.name,
			uri: schema.oauthClient.uri,
			redirectUris: schema.oauthClient.redirectUris,
			postLogoutRedirectUris: schema.oauthClient.postLogoutRedirectUris,
		})
		.from(schema.oauthClient)
		.where(eq(schema.oauthClient.clientId, clientId))
		.limit(1);
	if (client) {
		return {
			clientId: client.clientId,
			name: client.name ?? client.clientId,
			uri: client.uri,
			redirectUris: client.redirectUris,
			postLogoutRedirectUris: client.postLogoutRedirectUris,
		};
	}
	const seed = parseOAuthClientSeeds(env.OAUTH_CLIENTS).find((candidate) => candidate.id === clientId);
	if (!seed) throw new ClientAPIError({ status: 401, code: "invalid_token", message: "OAuth client is unavailable." });
	return {
		clientId: seed.id,
		name: seed.name,
		uri: seed.uri,
		redirectUris: seed.redirectUris,
		postLogoutRedirectUris: seed.postLogoutRedirectUris,
	};
}

async function authorizeBillingTarget(
	db: ReturnType<typeof createDb>,
	actor: Pick<DelegatedClientActor, "userId">,
	organizationId: string | undefined,
	write: boolean,
) {
	if (!organizationId) return { customerType: "user" as const, referenceId: actor.userId };
	const [membership] = await db
		.select({ role: schema.member.role })
		.from(schema.member)
		.where(and(eq(schema.member.userId, actor.userId), eq(schema.member.organizationId, organizationId)))
		.limit(1);
	if (!membership) {
		throw new ClientAPIError({ status: 404, code: "organization_not_found", message: "Organization not found." });
	}
	if (
		write &&
		!(await hasLiveOrganizationPermission(db, organizationId, membership.role, {
			resource: "organization",
			action: "update",
		}))
	) {
		throw new ClientAPIError({
			status: 403,
			code: "billing_permission_denied",
			message: "Your current organization role does not allow billing changes.",
		});
	}
	return { customerType: "organization" as const, referenceId: organizationId };
}

async function recordBillingIntentActivity(
	c: ClientAPIContext,
	actor: DelegatedClientActor,
	input: { action: BillingAction; intentId: string; referenceId: string },
) {
	const request = c.req.raw;
	await createDb(c.env as AuthEnv).insert(schema.accountActivityEvent).values({
		id: crypto.randomUUID(),
		userId: actor.userId,
		type: "connected_app_action",
		ipAddress: requestIPAddress(request),
		location: requestLocationFromRequest(request),
		userAgent: request.headers.get("user-agent"),
		metadata: JSON.stringify({
			clientId: actor.clientId,
			clientName: actor.clientName,
			action: `billing.${input.action}.intent.create`,
			targetType: "billing_action_intent",
			targetId: input.intentId,
			referenceId: input.referenceId,
		}),
	});
}

function publicBillingIntent(creation: Awaited<ReturnType<typeof createBillingActionIntent>>) {
	return {
		id: creation.id,
		action: creation.action,
		status: creation.status,
		expiresAt: creation.expiresAt,
		handoffUrl: creation.handoffUrl,
	};
}

async function sessionForBillingAction(c: ClientAPIContext) {
	const session = await auth(c.env as AuthEnv).api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		throw new ClientAPIError({
			status: 401,
			code: "authentication_required",
			message: "Sign in to Passport to continue.",
		});
	}
	return session;
}

async function billingActionContext(c: ClientAPIContext, intentId: string) {
	const env = c.env as AuthEnv;
	const db = createDb(env);
	const session = await sessionForBillingAction(c);
	const intent = await getBillingActionIntent(db, intentId, session.user.id);
	const requiredScope = intent.action === "checkout" ? "billing:checkout" : "billing:manage";
	const liveActor = await authorizeDelegatedGrant(env, db, {
		userId: session.user.id,
		clientId: intent.clientId,
		scopes: [requiredScope],
	});
	await authorizeBillingTarget(
		db,
		liveActor,
		intent.customerType === "organization" ? intent.referenceId : undefined,
		true,
	);

	const [organization, product, subscription] = await Promise.all([
		intent.customerType === "organization"
			? db
					.select({ id: schema.organization.id, name: schema.organization.name })
					.from(schema.organization)
					.where(eq(schema.organization.id, intent.referenceId))
					.limit(1)
			: Promise.resolve([]),
		intent.productId ? getBillingPlanById(db, intent.productId) : Promise.resolve(null),
		intent.subscriptionId
			? db
					.select({
						id: schema.subscription.id,
						plan: schema.subscription.plan,
						status: schema.subscription.status,
						referenceId: schema.subscription.referenceId,
						stripeSubscriptionId: schema.subscription.stripeSubscriptionId,
					})
					.from(schema.subscription)
					.where(
						and(
							eq(schema.subscription.id, intent.subscriptionId),
							eq(schema.subscription.referenceId, intent.referenceId),
						),
					)
					.limit(1)
			: Promise.resolve([]),
	]);
	if (intent.customerType === "organization" && !organization[0]) {
		throw new ClientAPIError({ status: 404, code: "organization_not_found", message: "Organization not found." });
	}
	if (intent.productId && !product) {
		throw new ClientAPIError({ status: 404, code: "product_not_found", message: "Product not found." });
	}
	if (intent.subscriptionId && !subscription[0]) {
		throw new ClientAPIError({ status: 404, code: "subscription_not_found", message: "Subscription not found." });
	}
	return { db, env, session, intent, liveActor, organization: organization[0], product, subscription: subscription[0] };
}

export function createClientAPI() {
	const app = new OpenAPIHono<ClientAPIEnv>({ defaultHook: defaultValidationHook });

	app.onError((error) => {
		if (error instanceof ClientAPIError) return error.toResponse();
		if (error instanceof DelegatedResourceError) {
			return Response.json(
				{ error: { code: error.code, message: error.message } },
				{ status: error.status },
			);
		}
		if (error instanceof BillingActionIntentError) {
			const status =
				error.code === "idempotency_conflict" || error.code === "intent_in_progress"
					? 409
					: error.code === "intent_not_found"
						? 404
						: error.code === "intent_expired"
							? 410
							: 400;
			return Response.json({ error: { code: error.code, message: error.message } }, { status });
		}
		return Response.json(
			{ error: { code: "internal_error", message: "An unexpected error occurred." } },
			{ status: 500 },
		);
	});

	app.get("/.well-known/oauth-protected-resource/api/v1", (c) =>
		c.json(clientAPIProtectedResourceMetadata((c.env as AuthEnv).BETTER_AUTH_URL)),
	);

	const mePatch = createRoute({
		method: "patch",
		path: "/api/v1/me",
		tags: ["Profile"],
		security: security("profile:write"),
		request: { body: { content: { "application/json": { schema: ProfilePatch } } } },
		responses: { 200: response("Updated profile"), ...commonErrors },
	});
	app.openapi(mePatch, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["profile:write"] });
		return c.json({ data: await resourceService(c).updateProfile(delegatedActor(actor), c.req.valid("json")) });
	});

	const picturePut = createRoute({
		method: "put",
		path: "/api/v1/me/profile-picture",
		tags: ["Profile"],
		security: security("profile:write"),
		request: { body: { content: { "multipart/form-data": { schema: ImageBody } } } },
		responses: { 200: response("Updated profile picture"), ...commonErrors },
	});
	app.openapi(picturePut, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["profile:write"], sensitive: true });
		return c.json({ data: await resourceService(c).setProfilePicture(delegatedActor(actor), c.req.valid("form").file) });
	});

	const pictureDelete = createRoute({
		method: "delete",
		path: "/api/v1/me/profile-picture",
		tags: ["Profile"],
		security: security("profile:write"),
		responses: { 204: { description: "Profile picture removed" }, ...commonErrors },
	});
	app.openapi(pictureDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["profile:write"], sensitive: true });
		await resourceService(c).clearProfilePicture(delegatedActor(actor));
		return noContent();
	});

	const organizationsGet = createRoute({
		method: "get",
		path: "/api/v1/organizations",
		tags: ["Organizations"],
		security: security("organizations"),
		responses: { 200: response("Organizations"), ...commonErrors },
	});
	app.openapi(organizationsGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations"] });
		return c.json({ data: await resourceService(c).listOrganizations(delegatedActor(actor)) });
	});

	const organizationsPost = createRoute({
		method: "post",
		path: "/api/v1/organizations",
		tags: ["Organizations"],
		security: security("organizations:write"),
		request: { body: { content: { "application/json": { schema: OrganizationWrite } } } },
		responses: { 201: response("Created organization"), ...commonErrors },
	});
	app.openapi(organizationsPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"] });
		const input = c.req.valid("json");
		return c.json(
			{
				data: await resourceService(c).createOrganization(delegatedActor(actor), {
					name: input.name,
					slug: input.slug ?? organizationSlug(input.name),
				}),
			},
			201,
		);
	});

	const organizationGet = createRoute({
		method: "get",
		path: "/api/v1/organizations/{organizationId}",
		tags: ["Organizations"], security: security("organizations"),
		request: { params: OrganizationItemParams },
		responses: { 200: response("Organization"), ...commonErrors },
	});
	app.openapi(organizationGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations"] });
		return c.json({ data: await resourceService(c).getOrganization(delegatedActor(actor), c.req.valid("param").organizationId) });
	});

	const organizationPatch = createRoute({
		method: "patch", path: "/api/v1/organizations/{organizationId}", tags: ["Organizations"],
		security: security("organizations:write"),
		request: { params: OrganizationItemParams, body: { content: { "application/json": { schema: OrganizationPatch } } } },
		responses: { 200: response("Updated organization"), ...commonErrors },
	});
	app.openapi(organizationPatch, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"] });
		return c.json({ data: await resourceService(c).updateOrganization(delegatedActor(actor), c.req.valid("param").organizationId, c.req.valid("json")) });
	});

	const organizationDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}", tags: ["Organizations"],
		security: security("organizations:write"), request: { params: OrganizationItemParams },
		responses: { 204: { description: "Organization deleted" }, ...commonErrors },
	});
	app.openapi(organizationDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"] });
		await resourceService(c).deleteOrganization(delegatedActor(actor), c.req.valid("param").organizationId);
		return noContent();
	});

	const organizationLeave = createRoute({
		method: "post", path: "/api/v1/organizations/{organizationId}/leave", tags: ["Organizations"],
		security: security("organizations:write"), request: { params: OrganizationItemParams },
		responses: { 204: { description: "Organization left" }, ...commonErrors },
	});
	app.openapi(organizationLeave, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"] });
		await resourceService(c).leaveOrganization(delegatedActor(actor), c.req.valid("param").organizationId);
		return noContent();
	});

	const organizationLogoPut = createRoute({
		method: "put", path: "/api/v1/organizations/{organizationId}/logo", tags: ["Organizations"],
		security: security("organizations:write"),
		request: { params: OrganizationItemParams, body: { content: { "multipart/form-data": { schema: ImageBody } } } },
		responses: { 200: response("Updated organization logo"), ...commonErrors },
	});
	app.openapi(organizationLogoPut, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"], sensitive: true });
		return c.json({ data: await resourceService(c).setOrganizationLogo(delegatedActor(actor), c.req.valid("param").organizationId, c.req.valid("form").file) });
	});

	const organizationLogoDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/logo", tags: ["Organizations"],
		security: security("organizations:write"), request: { params: OrganizationItemParams },
		responses: { 204: { description: "Organization logo removed" }, ...commonErrors },
	});
	app.openapi(organizationLogoDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organizations:write"], sensitive: true });
		await resourceService(c).clearOrganizationLogo(delegatedActor(actor), c.req.valid("param").organizationId);
		return noContent();
	});

	const myInvitations = createRoute({
		method: "get", path: "/api/v1/me/organization-invitations", tags: ["Invitations"],
		security: security("organization-invitations:read"),
		responses: { 200: response("Invitations"), ...commonErrors },
	});
	app.openapi(myInvitations, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-invitations:read"] });
		return c.json({ data: await resourceService(c).listMyOrganizationInvitations(delegatedActor(actor)) });
	});

	for (const action of ["accept", "reject"] as const) {
		const route = createRoute({
			method: "post", path: `/api/v1/me/organization-invitations/{invitationId}/${action}`,
			tags: ["Invitations"], security: security("organization-invitations:write"),
			request: { params: InvitationParams }, responses: { 200: response(`${action}ed invitation`), ...commonErrors },
		});
		app.openapi(route, async (c) => {
			const actor = await authorize(c, { requiredScopes: ["organization-invitations:write"] });
			const service = resourceService(c);
			const data = action === "accept"
				? await service.acceptOrganizationInvitation(delegatedActor(actor), c.req.valid("param").invitationId)
				: await service.rejectOrganizationInvitation(delegatedActor(actor), c.req.valid("param").invitationId);
			return c.json({ data });
		});
	}

	const invitationsGet = createRoute({
		method: "get", path: "/api/v1/organizations/{organizationId}/invitations", tags: ["Invitations"],
		security: security("organization-invitations:read"), request: { params: IDParams },
		responses: { 200: response("Invitations"), ...commonErrors },
	});
	app.openapi(invitationsGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-invitations:read"] });
		return c.json({ data: await resourceService(c).listOrganizationInvitations(delegatedActor(actor), c.req.valid("param").organizationId) });
	});

	const invitationsPost = createRoute({
		method: "post", path: "/api/v1/organizations/{organizationId}/invitations", tags: ["Invitations"],
		security: security("organization-invitations:write"),
		request: { params: IDParams, body: { content: { "application/json": { schema: InvitationWrite } } } },
		responses: { 201: response("Created invitation"), ...commonErrors },
	});
	app.openapi(invitationsPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-invitations:write"] });
		const input = c.req.valid("json");
		return c.json({ data: await resourceService(c).createOrganizationInvitation(delegatedActor(actor), c.req.valid("param").organizationId, { email: input.email, role: input.role, teamID: input.teamId }) }, 201);
	});

	const invitationDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/invitations/{invitationId}", tags: ["Invitations"],
		security: security("organization-invitations:write"), request: { params: OrganizationInvitationParams },
		responses: { 204: { description: "Invitation canceled" }, ...commonErrors },
	});
	app.openapi(invitationDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-invitations:write"] });
		const params = c.req.valid("param");
		await resourceService(c).cancelOrganizationInvitation(delegatedActor(actor), params.organizationId, params.invitationId);
		return noContent();
	});

	const membersGet = createRoute({
		method: "get", path: "/api/v1/organizations/{organizationId}/members", tags: ["Members"],
		security: security("organization-members:read"), request: { params: IDParams },
		responses: { 200: response("Members"), ...commonErrors },
	});
	app.openapi(membersGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-members:read"] });
		return c.json({ data: await resourceService(c).listOrganizationMembers(delegatedActor(actor), c.req.valid("param").organizationId) });
	});

	const memberPatch = createRoute({
		method: "patch", path: "/api/v1/organizations/{organizationId}/members/{memberId}", tags: ["Members"],
		security: security("organization-members:write"),
		request: { params: OrganizationMemberParams, body: { content: { "application/json": { schema: MemberPatch } } } },
		responses: { 200: response("Updated member"), ...commonErrors },
	});
	app.openapi(memberPatch, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-members:write"] });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).updateOrganizationMember(delegatedActor(actor), params.organizationId, params.memberId, c.req.valid("json").role) });
	});

	const memberDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/members/{memberId}", tags: ["Members"],
		security: security("organization-members:write"), request: { params: OrganizationMemberParams },
		responses: { 204: { description: "Member removed" }, ...commonErrors },
	});
	app.openapi(memberDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["organization-members:write"] });
		const params = c.req.valid("param");
		await resourceService(c).removeOrganizationMember(delegatedActor(actor), params.organizationId, params.memberId);
		return noContent();
	});

	const teamsGet = createRoute({
		method: "get", path: "/api/v1/organizations/{organizationId}/teams", tags: ["Teams"],
		security: security("teams"), request: { params: IDParams },
		responses: { 200: response("Teams"), ...commonErrors },
	});
	app.openapi(teamsGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams"] });
		return c.json({ data: await resourceService(c).listTeams(delegatedActor(actor), c.req.valid("param").organizationId) });
	});

	const teamsPost = createRoute({
		method: "post", path: "/api/v1/organizations/{organizationId}/teams", tags: ["Teams"],
		security: security("teams:write"), request: { params: IDParams, body: { content: { "application/json": { schema: TeamWrite } } } },
		responses: { 201: response("Created team"), ...commonErrors },
	});
	app.openapi(teamsPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams:write"] });
		return c.json({ data: await resourceService(c).createTeam(delegatedActor(actor), c.req.valid("param").organizationId, c.req.valid("json")) }, 201);
	});

	const teamGet = createRoute({
		method: "get", path: "/api/v1/organizations/{organizationId}/teams/{teamId}", tags: ["Teams"],
		security: security("teams"), request: { params: TeamParams }, responses: { 200: response("Team"), ...commonErrors },
	});
	app.openapi(teamGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams"] });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).getTeam(delegatedActor(actor), params.organizationId, params.teamId) });
	});

	const teamPatch = createRoute({
		method: "patch", path: "/api/v1/organizations/{organizationId}/teams/{teamId}", tags: ["Teams"],
		security: security("teams:write"), request: { params: TeamParams, body: { content: { "application/json": { schema: TeamWrite } } } },
		responses: { 200: response("Updated team"), ...commonErrors },
	});
	app.openapi(teamPatch, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams:write"] });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).updateTeam(delegatedActor(actor), params.organizationId, params.teamId, c.req.valid("json")) });
	});

	const teamDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/teams/{teamId}", tags: ["Teams"],
		security: security("teams:write"), request: { params: TeamParams }, responses: { 204: { description: "Team deleted" }, ...commonErrors },
	});
	app.openapi(teamDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams:write"] });
		const params = c.req.valid("param");
		await resourceService(c).deleteTeam(delegatedActor(actor), params.organizationId, params.teamId);
		return noContent();
	});

	const teamLogoPut = createRoute({
		method: "put", path: "/api/v1/organizations/{organizationId}/teams/{teamId}/logo", tags: ["Teams"],
		security: security("teams:write"), request: { params: TeamParams, body: { content: { "multipart/form-data": { schema: ImageBody } } } },
		responses: { 200: response("Updated team logo"), ...commonErrors },
	});
	app.openapi(teamLogoPut, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams:write"], sensitive: true });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).setTeamLogo(delegatedActor(actor), params.organizationId, params.teamId, c.req.valid("form").file) });
	});

	const teamLogoDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/teams/{teamId}/logo", tags: ["Teams"],
		security: security("teams:write"), request: { params: TeamParams }, responses: { 204: { description: "Team logo removed" }, ...commonErrors },
	});
	app.openapi(teamLogoDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["teams:write"], sensitive: true });
		const params = c.req.valid("param");
		await resourceService(c).clearTeamLogo(delegatedActor(actor), params.organizationId, params.teamId);
		return noContent();
	});

	const teamMembersGet = createRoute({
		method: "get", path: "/api/v1/organizations/{organizationId}/teams/{teamId}/members", tags: ["Team members"],
		security: security("team-members:read"), request: { params: TeamParams }, responses: { 200: response("Team members"), ...commonErrors },
	});
	app.openapi(teamMembersGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["team-members:read"] });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).listTeamMembers(delegatedActor(actor), params.organizationId, params.teamId) });
	});

	const teamMembersPost = createRoute({
		method: "post", path: "/api/v1/organizations/{organizationId}/teams/{teamId}/members", tags: ["Team members"],
		security: security("team-members:write"), request: { params: TeamParams, body: { content: { "application/json": { schema: TeamMemberWrite } } } },
		responses: { 201: response("Added team member"), ...commonErrors },
	});
	app.openapi(teamMembersPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["team-members:write"] });
		const params = c.req.valid("param");
		return c.json({ data: await resourceService(c).addTeamMember(delegatedActor(actor), params.organizationId, params.teamId, c.req.valid("json").userId) }, 201);
	});

	const teamMemberDelete = createRoute({
		method: "delete", path: "/api/v1/organizations/{organizationId}/teams/{teamId}/members/{userId}", tags: ["Team members"],
		security: security("team-members:write"), request: { params: TeamMemberParams }, responses: { 204: { description: "Team member removed" }, ...commonErrors },
	});
	app.openapi(teamMemberDelete, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["team-members:write"] });
		const params = c.req.valid("param");
		await resourceService(c).removeTeamMember(delegatedActor(actor), params.organizationId, params.teamId, params.userId);
		return noContent();
	});

	const productsGet = createRoute({
		method: "get", path: "/api/v1/billing/products", tags: ["Billing"],
		security: [
			{ oauth2: ["billing:checkout"] },
			{ oauth2: ["billing:subscriptions"] },
			{ oauth2: ["billing:purchases"] },
		],
		responses: { 200: response("Products"), ...commonErrors },
	});
	app.openapi(productsGet, async (c) => {
		await authorize(c, { anyScope: ["billing:checkout", "billing:subscriptions", "billing:purchases"] });
		const env = c.env as AuthEnv;
		const db = createDb(env);
		const rows = await listBillingPlans(db);
		const visible = rows.filter((row) => !row.hidden);
		const definitions = visible.map(rowToDefinition);
		const prices = await resolveStripePrices(env, catalogPriceIds(definitions));
		return c.json({ data: visible.map((row) => billingPlanCatalogEntry(rowToDefinition(row), row.id, prices)) });
	});

	const productGet = createRoute({
		method: "get", path: "/api/v1/billing/products/{productId}", tags: ["Billing"],
		security: [
			{ oauth2: ["billing:checkout"] },
			{ oauth2: ["billing:subscriptions"] },
			{ oauth2: ["billing:purchases"] },
		],
		request: { params: ProductParams }, responses: { 200: response("Product"), ...commonErrors },
	});
	app.openapi(productGet, async (c) => {
		await authorize(c, { anyScope: ["billing:checkout", "billing:subscriptions", "billing:purchases"] });
		const env = c.env as AuthEnv;
		const db = createDb(env);
		const row = await getBillingPlanById(db, c.req.valid("param").productId);
		if (!row) throw new ClientAPIError({ status: 404, code: "product_not_found", message: "Product not found." });
		const definition = rowToDefinition(row);
		const prices = await resolveStripePrices(env, catalogPriceIds([definition]));
		return c.json({ data: billingPlanCatalogEntry(definition, row.id, prices) });
	});

	const subscriptionsGet = createRoute({
		method: "get", path: "/api/v1/billing/subscriptions", tags: ["Billing"],
		security: security("billing:subscriptions"), request: { query: BillingTargetQuery },
		responses: { 200: response("Subscriptions"), ...commonErrors },
	});
	app.openapi(subscriptionsGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["billing:subscriptions"] });
		const db = createDb(c.env as AuthEnv);
		const target = await authorizeBillingTarget(db, actor, c.req.valid("query").organizationId, false);
		const rows = await db
			.select({
				id: schema.subscription.id,
				plan: schema.subscription.plan,
				status: schema.subscription.status,
				referenceId: schema.subscription.referenceId,
				periodStart: schema.subscription.periodStart,
				periodEnd: schema.subscription.periodEnd,
				trialStart: schema.subscription.trialStart,
				trialEnd: schema.subscription.trialEnd,
				cancelAtPeriodEnd: schema.subscription.cancelAtPeriodEnd,
				cancelAt: schema.subscription.cancelAt,
				canceledAt: schema.subscription.canceledAt,
				endedAt: schema.subscription.endedAt,
				seats: schema.subscription.seats,
				billingInterval: schema.subscription.billingInterval,
			})
			.from(schema.subscription)
			.where(eq(schema.subscription.referenceId, target.referenceId));
		return c.json({ data: rows });
	});

	const purchasesGet = createRoute({
		method: "get", path: "/api/v1/billing/purchases", tags: ["Billing"],
		security: security("billing:purchases"), request: { query: BillingTargetQuery },
		responses: { 200: response("Purchases"), ...commonErrors },
	});
	app.openapi(purchasesGet, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["billing:purchases"] });
		const db = createDb(c.env as AuthEnv);
		const target = await authorizeBillingTarget(db, actor, c.req.valid("query").organizationId, false);
		const rows = await db
			.select({
				id: schema.oneTimePurchase.id,
				plan: schema.oneTimePurchase.plan,
				status: schema.oneTimePurchase.status,
				quantity: schema.oneTimePurchase.quantity,
				amountTotal: schema.oneTimePurchase.amountTotal,
				currency: schema.oneTimePurchase.currency,
				purchasedAt: schema.oneTimePurchase.purchasedAt,
				createdAt: schema.oneTimePurchase.createdAt,
			})
			.from(schema.oneTimePurchase)
			.where(eq(schema.oneTimePurchase.referenceId, target.referenceId));
		return c.json({ data: rows });
	});

	const checkoutIntentPost = createRoute({
		method: "post", path: "/api/v1/billing/checkout-intents", tags: ["Billing"],
		security: security("billing:checkout"),
		request: {
			headers: IdempotencyHeaders,
			body: { content: { "application/json": { schema: CheckoutIntentBody } } },
		},
		responses: { 201: response("Created checkout intent"), 200: response("Replayed checkout intent"), ...commonErrors },
	});
	app.openapi(checkoutIntentPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["billing:checkout"], sensitive: true });
		const env = c.env as AuthEnv;
		const db = createDb(env);
		const input = c.req.valid("json");
		const target = await authorizeBillingTarget(db, actor, input.organizationId, true);
		const product = await getBillingPlanById(db, input.productId);
		if (!product) throw new ClientAPIError({ status: 404, code: "product_not_found", message: "Product not found." });
		if (target.customerType === "organization" && product.personalOnly) {
			throw new ClientAPIError({ status: 403, code: "personal_product", message: "This product is only available for personal billing." });
		}
		const client = await registeredBillingClient(env, db, actor.clientId);
		const creation = await createBillingActionIntent(db, env.BETTER_AUTH_URL, {
			userId: actor.userId,
			client,
			action: "checkout",
			...(input.organizationId ? { organizationId: input.organizationId } : {}),
			productId: input.productId,
			annual: input.annual,
			seats: input.seats,
			successUrl: input.successUrl,
			cancelUrl: input.cancelUrl,
			idempotencyKey: c.req.header("Idempotency-Key") ?? "",
		});
		if (creation.wasCreated) {
			await recordBillingIntentActivity(c, actor, { action: "checkout", intentId: creation.id, referenceId: target.referenceId });
		}
		return c.json({ data: publicBillingIntent(creation) }, creation.wasCreated ? 201 : 200);
	});

	const portalIntentPost = createRoute({
		method: "post", path: "/api/v1/billing/portal-intents", tags: ["Billing"],
		security: security("billing:manage"),
		request: { headers: IdempotencyHeaders, body: { content: { "application/json": { schema: PortalIntentBody } } } },
		responses: { 201: response("Created portal intent"), 200: response("Replayed portal intent"), ...commonErrors },
	});
	app.openapi(portalIntentPost, async (c) => {
		const actor = await authorize(c, { requiredScopes: ["billing:manage"], sensitive: true });
		const env = c.env as AuthEnv;
		const db = createDb(env);
		const input = c.req.valid("json");
		const target = await authorizeBillingTarget(db, actor, input.organizationId, true);
		const client = await registeredBillingClient(env, db, actor.clientId);
		const creation = await createBillingActionIntent(db, env.BETTER_AUTH_URL, {
			userId: actor.userId, client, action: "portal",
			...(input.organizationId ? { organizationId: input.organizationId } : {}),
			returnUrl: input.returnUrl,
			idempotencyKey: c.req.header("Idempotency-Key") ?? "",
		});
		if (creation.wasCreated) await recordBillingIntentActivity(c, actor, { action: "portal", intentId: creation.id, referenceId: target.referenceId });
		return c.json({ data: publicBillingIntent(creation) }, creation.wasCreated ? 201 : 200);
	});

	for (const action of ["cancel", "restore"] as const) {
		const route = createRoute({
			method: "post",
			path: `/api/v1/billing/subscriptions/{subscriptionId}/${action}-intents`,
			tags: ["Billing"], security: security("billing:manage"),
			request: {
				params: SubscriptionParams,
				headers: IdempotencyHeaders,
				body: { content: { "application/json": { schema: SubscriptionIntentBody } } },
			},
			responses: { 201: response(`Created ${action} intent`), 200: response(`Replayed ${action} intent`), ...commonErrors },
		});
		app.openapi(route, async (c) => {
			const actor = await authorize(c, { requiredScopes: ["billing:manage"], sensitive: true });
			const env = c.env as AuthEnv;
			const db = createDb(env);
			const subscriptionId = c.req.valid("param").subscriptionId;
			const [subscription] = await db
				.select({ id: schema.subscription.id, referenceId: schema.subscription.referenceId })
				.from(schema.subscription)
				.where(eq(schema.subscription.id, subscriptionId))
				.limit(1);
			if (!subscription) throw new ClientAPIError({ status: 404, code: "subscription_not_found", message: "Subscription not found." });
			const organizationId = subscription.referenceId === actor.userId ? undefined : subscription.referenceId;
			const target = await authorizeBillingTarget(db, actor, organizationId, true);
			const client = await registeredBillingClient(env, db, actor.clientId);
			const billingAction = `${action}_subscription` as const satisfies BillingAction;
			const creation = await createBillingActionIntent(db, env.BETTER_AUTH_URL, {
				userId: actor.userId, client, action: billingAction,
				...(organizationId ? { organizationId } : {}),
				subscriptionId,
				returnUrl: c.req.valid("json").returnUrl,
				idempotencyKey: c.req.header("Idempotency-Key") ?? "",
			});
			if (creation.wasCreated) await recordBillingIntentActivity(c, actor, { action: billingAction, intentId: creation.id, referenceId: target.referenceId });
			return c.json({ data: publicBillingIntent(creation) }, creation.wasCreated ? 201 : 200);
		});
	}

	app.get("/api/billing/actions/:intentId", async (c) => {
		const context = await billingActionContext(c, c.req.param("intentId"));
		const { intent, liveActor, organization, product, subscription } = context;
		return c.json({
			data: {
				id: intent.id,
				action: intent.action,
				status: intent.status,
				expiresAt: intent.expiresAt.toISOString(),
				client: { id: liveActor.clientId, name: liveActor.clientName },
				target: {
					type: intent.customerType,
					id: intent.referenceId,
					label: organization?.name ?? context.session.user.name,
				},
				...(product ? { product: { id: product.id, name: product.name, label: product.label } } : {}),
				...(subscription ? { subscription: { id: subscription.id, plan: subscription.plan, status: subscription.status } } : {}),
				resultUrl: intent.resultUrl,
			},
		});
	});

	app.post("/api/billing/actions/:intentId/execute", async (c) => {
		const context = await billingActionContext(c, c.req.param("intentId"));
		if (context.intent.status === "completed") {
			return c.json({ data: { status: "completed", url: context.intent.resultUrl } });
		}
		const claimed = await claimBillingActionIntent(context.db, context.intent.id, context.session.user.id);
		try {
			let resultUrl: string | null = null;
			const customerType = claimed.customerType === "organization" ? "organization" : "user";
			if (claimed.action === "checkout" && context.product) {
				const definition = rowToDefinition(context.product);
				if ((definition.type ?? "subscription") === "one_time") {
					const result = await createOneTimeCheckout(context.env, context.db, {
						plan: definition.name,
						customerType,
						...(customerType === "organization" ? { referenceId: claimed.referenceId } : {}),
						user: { id: context.session.user.id, email: context.session.user.email },
						successUrl: claimed.successUrl ?? context.env.BETTER_AUTH_URL,
						cancelUrl: claimed.cancelUrl ?? context.env.BETTER_AUTH_URL,
					});
					resultUrl = result.url;
				} else {
					const result = await auth(context.env).api.upgradeSubscription({
						headers: c.req.raw.headers,
						body: {
							plan: definition.name,
							annual: claimed.annual ?? false,
							...(claimed.seats ? { seats: claimed.seats } : {}),
							customerType,
							...(customerType === "organization" ? { referenceId: claimed.referenceId } : {}),
							successUrl: claimed.successUrl ?? context.env.BETTER_AUTH_URL,
							cancelUrl: claimed.cancelUrl ?? context.env.BETTER_AUTH_URL,
							disableRedirect: true,
						},
					});
					resultUrl = "url" in result && typeof result.url === "string" ? result.url : null;
				}
			} else if (claimed.action === "portal") {
				const result = await auth(context.env).api.createBillingPortal({
					headers: c.req.raw.headers,
					body: {
						customerType,
						...(customerType === "organization" ? { referenceId: claimed.referenceId } : {}),
						returnUrl: claimed.returnUrl ?? context.env.BETTER_AUTH_URL,
						disableRedirect: true,
					},
				});
				resultUrl = result.url;
			} else if (claimed.action === "cancel_subscription" && context.subscription?.stripeSubscriptionId) {
				const result = await auth(context.env).api.cancelSubscription({
					headers: c.req.raw.headers,
					body: {
						customerType,
						...(customerType === "organization" ? { referenceId: claimed.referenceId } : {}),
						subscriptionId: context.subscription.stripeSubscriptionId,
						returnUrl: claimed.returnUrl ?? context.env.BETTER_AUTH_URL,
						disableRedirect: true,
					},
				});
				resultUrl = result.url;
			} else if (claimed.action === "restore_subscription" && context.subscription?.stripeSubscriptionId) {
				await auth(context.env).api.restoreSubscription({
					headers: c.req.raw.headers,
					body: {
						customerType,
						...(customerType === "organization" ? { referenceId: claimed.referenceId } : {}),
						subscriptionId: context.subscription.stripeSubscriptionId,
					},
				});
				resultUrl = claimed.returnUrl;
			} else {
				throw new ClientAPIError({ status: 409, code: "billing_action_unavailable", message: "The billing action can no longer be completed." });
			}
			const completed = await completeBillingActionIntent(context.db, claimed.id, resultUrl);
			return c.json({ data: { status: completed.status, url: completed.resultUrl } });
		} catch (error) {
			await failBillingActionIntent(context.db, claimed.id);
			throw error;
		}
	});

	app.openAPIRegistry.registerComponent("securitySchemes", "oauth2", {
		type: "oauth2",
		flows: {
			authorizationCode: {
				authorizationUrl: "/api/auth/oauth2/authorize",
				tokenUrl: "/api/auth/oauth2/token",
				scopes: Object.fromEntries(
					DELEGATED_CLIENT_API_SCOPES.map((scope) => [scope, OAUTH_SCOPE_DEFINITIONS[scope].description]),
				),
			},
		},
	});
	app.doc("/api/v1/openapi.json", {
		openapi: "3.1.0",
		info: {
			title: "Passport Delegated Resource API",
			version: "1.0.0",
			description: "Actor-aware profile, organization, team, and hosted billing operations for confidential OAuth clients.",
		},
		servers: [{ url: "/api/v1" }],
	});

	return app;
}

export { cleanupBillingActionIntents };
