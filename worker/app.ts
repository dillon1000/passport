/**
 * Worker HTTP app: defines public route boundaries, request validation, and
 * response DTOs. Service implementations receive authenticated contexts plus
 * parsed inputs and own any Better Auth, database, or storage side effects.
 * Optional tracing is injected by the Worker entrypoint so request spans use
 * Cloudflare's runtime API while unit tests can supply a lightweight tracer.
 */
import { Hono } from "hono";
import { z } from "zod";

import {
	ADMIN_AUDIT_ACTIONS,
	ADMIN_AUDIT_TARGET_TYPES,
	type AdminAuditEventInput,
	type AdminAuditMetadata,
} from "../src/lib/admin-audit";
import type { AccountActivitySummary } from "../src/lib/account-activity";
import { WEBHOOK_EVENT_TYPE_VALUES, safeWebhookURL } from "../src/lib/webhooks";
import type { ConsentClientMetadata } from "../src/lib/oauth-client-metadata";
import { unsupportedOAuthScopesMessage } from "../src/lib/oauth-scopes";
import type { DataExportRequestSummary } from "../src/lib/data-export";
import {
	DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
	type EmailNotificationPreferences,
} from "../src/lib/notification-preferences";
import type { RequestLocation } from "../src/lib/request-location";
import { isAdminOperator } from "../src/lib/admin-access";

type AuthHandler = (request: Request, env: Env) => Response | Promise<Response>;
type ProfileSession = {
	user: {
		id: string;
		email?: string | null;
		name?: string | null;
		image?: string | null;
		role?: string | null;
	};
};
type SessionResolver = (request: Request, env: Env) => ProfileSession | null | Promise<ProfileSession | null>;
export type TraceSpan = {
	readonly isTraced: boolean;
	setAttribute(key: string, value?: boolean | number | string): void;
};
type WorkerResponse = Response | undefined | Promise<Response | undefined>;
type TracedResponse = Response | Promise<Response>;
export type RequestTracer = {
	enterSpan(
		name: string,
		callback: (span: TraceSpan) => TracedResponse,
	): TracedResponse;
};

export type ApplicationSummary = {
	consentId: string;
	clientId: string;
	name: string;
	icon?: string | null;
	uri?: string | null;
	scopes: string[];
	authorizedAt?: string | null;
	updatedAt?: string | null;
};

type ApplicationContext = {
	request: Request;
	env: Env;
	session: ProfileSession;
};

type AgentConfigurationContext = {
	request: Request;
	env: Env;
};
type AgentConfigurationResolver = (
	context: AgentConfigurationContext,
) => unknown | Promise<unknown>;

type ApplicationRevokeContext = ApplicationContext & {
	consentId: string;
};

export type PageInput = {
	limit: number;
	cursor?: string;
};

export type PageResult<T> = {
	items: T[];
	nextCursor?: string;
};

export type ApplicationService = {
	list: (
		context: ApplicationContext,
		page: PageInput,
	) => PageResult<ApplicationSummary> | Promise<PageResult<ApplicationSummary>>;
	revoke: (context: ApplicationRevokeContext) => void | Promise<void>;
};

export type OAuthClientSummary = {
	clientId: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	scopes?: string[];
	uri?: string | null;
	icon?: string | null;
	tos?: string | null;
	policy?: string | null;
	public?: boolean;
	disabled?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
	backchannelLogoutUri?: string | null;
};

export type OAuthClientWithSecret = OAuthClientSummary & {
	clientSecret?: string;
};

type AdminOAuthContext = ApplicationContext;
type AdminUserRole = "user" | "admin";

type OAuthClientMetadataContext = ApplicationContext;

export type OAuthClientMetadataService = {
	resolve: (
		context: OAuthClientMetadataContext,
		clientId: string,
	) => ConsentClientMetadata | null | Promise<ConsentClientMetadata | null>;
};

export type AdminAuditEventSummary = {
	id: string;
	createdAt: string;
	actorUserId?: string | null;
	actorEmail?: string | null;
	actorRole?: string | null;
	action: string;
	targetType: string;
	targetId?: string | null;
	targetLabel?: string | null;
	organizationId?: string | null;
	ipAddress?: string | null;
	location?: RequestLocation | null;
	userAgent?: string | null;
	metadata?: AdminAuditMetadata;
};

export type AdminAuditService = {
	list: (
		context: ApplicationContext,
		page: PageInput,
	) => PageResult<AdminAuditEventSummary> | Promise<PageResult<AdminAuditEventSummary>>;
	record: (
		context: ApplicationContext,
		input: AdminAuditEventInput,
	) => void | Promise<void>;
};

export type AccountActivityService = {
	list: (
		context: ApplicationContext,
		page: PageInput,
	) => PageResult<AccountActivitySummary> | Promise<PageResult<AccountActivitySummary>>;
};

export type WebhookEndpointSummary = {
	id: string;
	url: string;
	events: string[];
	description?: string | null;
	disabled: boolean;
	createdAt: string;
};

export type WebhookEndpointWithSecret = WebhookEndpointSummary & {
	secret: string;
};

export type WebhookDeliverySummary = {
	id: string;
	eventType: string;
	status: string;
	attempts: number;
	responseStatus?: number | null;
	error?: string | null;
	createdAt: string;
	deliveredAt?: string | null;
};

export type WebhookCreateInput = {
	url: string;
	events: string[];
	description?: string;
};

export type WebhookUpdateInput = {
	events?: string[];
	description?: string | null;
	disabled?: boolean;
};

export type WebhookService = {
	list: (
		context: AdminOAuthContext,
		page: PageInput,
	) => PageResult<WebhookEndpointSummary> | Promise<PageResult<WebhookEndpointSummary>>;
	create: (
		context: AdminOAuthContext,
		input: WebhookCreateInput,
	) => WebhookEndpointWithSecret | Promise<WebhookEndpointWithSecret>;
	update: (
		context: AdminOAuthContext,
		id: string,
		input: WebhookUpdateInput,
	) => WebhookEndpointSummary | null | Promise<WebhookEndpointSummary | null>;
	remove: (context: AdminOAuthContext, id: string) => boolean | Promise<boolean>;
	rotateSecret: (
		context: AdminOAuthContext,
		id: string,
	) => WebhookEndpointWithSecret | null | Promise<WebhookEndpointWithSecret | null>;
	listDeliveries: (
		context: AdminOAuthContext,
		id: string,
		page: PageInput,
	) => PageResult<WebhookDeliverySummary> | Promise<PageResult<WebhookDeliverySummary>>;
};

export type AdminUserMutationResult = {
	userId: string;
	email?: string | null;
	role?: string | null;
	banned?: boolean | null;
};

export type AdminUserService = {
	setRole: (
		context: ApplicationContext,
		userId: string,
		role: AdminUserRole,
	) => AdminUserMutationResult | Promise<AdminUserMutationResult>;
	ban: (
		context: ApplicationContext,
		userId: string,
		input: { banReason?: string; banExpiresIn?: number },
	) => AdminUserMutationResult | Promise<AdminUserMutationResult>;
	unban: (
		context: ApplicationContext,
		userId: string,
	) => AdminUserMutationResult | Promise<AdminUserMutationResult>;
};

export type AccountPasswordInput = {
	currentPassword?: string;
	newPassword: string;
};

export type AccountPasswordService = {
	update: (
		context: ApplicationContext,
		input: AccountPasswordInput,
	) => Response | Promise<Response>;
};

export type DataExportService = {
	current: (
		context: ApplicationContext,
	) => DataExportRequestSummary | null | Promise<DataExportRequestSummary | null>;
	request: (
		context: ApplicationContext,
	) => DataExportRequestSummary | Promise<DataExportRequestSummary>;
	cancel: (
		context: ApplicationContext,
		requestId: string,
	) => DataExportRequestSummary | null | Promise<DataExportRequestSummary | null>;
	cancelWithToken: (
		request: Request,
		env: Env,
		requestId: string,
	) => Response | Promise<Response>;
	downloadWithToken: (
		request: Request,
		env: Env,
		requestId: string,
	) => Response | Promise<Response>;
};

export type EmailNotificationPreferenceService = {
	get: (
		context: ApplicationContext,
	) => EmailNotificationPreferences | Promise<EmailNotificationPreferences>;
	update: (
		context: ApplicationContext,
		preferences: EmailNotificationPreferences,
	) => EmailNotificationPreferences | Promise<EmailNotificationPreferences>;
};

export type CreateOAuthClientInput = {
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	scopes?: string[];
	uri?: string;
	icon?: string;
	tos?: string;
	policy?: string;
	public?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
	backchannelLogoutUri?: string | null;
};

export type UpdateOAuthClientInput = Partial<Omit<CreateOAuthClientInput, "public">>;

export type AdminOAuthService = {
	list: (
		context: AdminOAuthContext,
		page: PageInput,
	) => PageResult<OAuthClientSummary> | Promise<PageResult<OAuthClientSummary>>;
	create: (
		context: AdminOAuthContext,
		input: CreateOAuthClientInput,
	) => OAuthClientWithSecret | Promise<OAuthClientWithSecret>;
	update: (
		context: AdminOAuthContext,
		clientId: string,
		input: UpdateOAuthClientInput,
	) => OAuthClientSummary | Promise<OAuthClientSummary>;
	rotateSecret: (
		context: AdminOAuthContext,
		clientId: string,
	) => OAuthClientWithSecret | Promise<OAuthClientWithSecret>;
	setDisabled: (
		context: AdminOAuthContext,
		clientId: string,
		disabled: boolean,
	) => OAuthClientSummary | Promise<OAuthClientSummary>;
};

type AppOptions = {
	authHandler: AuthHandler;
	tracer?: RequestTracer;
	agentConfiguration?: AgentConfigurationResolver;
	getSession?: SessionResolver;
	applications?: ApplicationService;
	clientMetadata?: OAuthClientMetadataService;
	adminOAuth?: AdminOAuthService;
	adminAudit?: AdminAuditService;
	adminUsers?: AdminUserService;
	accountPassword?: AccountPasswordService;
	dataExports?: DataExportService;
	emailNotificationPreferences?: EmailNotificationPreferenceService;
	activityLog?: AccountActivityService;
	webhooks?: WebhookService;
};

const AUTH_PATH_PREFIXES = [
	"/api/auth/",
	"/reset-password/",
	"/oauth2/",
	"/.well-known/oauth-authorization-server",
	"/.well-known/openid-configuration",
];
const PROFILE_IMAGE_PATH_PREFIX = "/api/profile-images/";
const PROFILE_IMAGE_UPLOAD_PATH = "/api/profile-images";
const PROFILE_IMAGE_KEY_PREFIX = "profile-images";
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
const PROFILE_IMAGE_PURPOSES = [
	"profile",
	"organization-logo",
	"team-logo",
	"application-picture",
] as const;
const IMAGE_EXTENSIONS = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
} as const;

type PublicEnv = Env & {
	ADMIN_EMAILS?: string;
	BETTER_AUTH_URL?: string;
	OAUTH_PROXY_PRODUCTION_URL?: string;
	OAUTH_PROXY_SECRET?: string;
	TRUSTED_ORIGINS?: string;
	BRAND_NAME?: string;
	BRAND_DESCRIPTOR?: string;
	BRAND_LOGO_SRC?: string;
	BRAND_CAPABILITIES?: string;
	BRAND_COLOR?: string;
	BRAND_FOREGROUND_COLOR?: string;
	PRIMARY_COLOR?: string;
	PRIMARY_FOREGROUND_COLOR?: string;
	RING_COLOR?: string;
	CAPTCHA_PROVIDER?: string;
	CAPTCHA_SECRET_KEY?: string;
	CAPTCHA_SITE_KEY?: string;
	ADMIN_USER_IDS?: string;
};

const DEFAULT_BRAND = {
	name: "Passport",
	descriptor: "Identity provider",
	capabilities: ["OIDC", "PKCE", "JWKS"],
};

const requiredOAuthURLArray = z.array(z.string().url()).min(1);
const optionalOAuthURLArray = z.array(z.string().url());
const optionalOAuthURL = z.string().url().optional();
const oauthScopesArray = z.array(z.string().trim().min(1)).superRefine((scopes, context) => {
	const message = unsupportedOAuthScopesMessage(scopes);
	if (!message) return;
	context.addIssue({
		code: "custom",
		message,
	});
});

const createOAuthClientSchema = z.object({
	name: z.string().trim().min(1),
	redirectUris: requiredOAuthURLArray,
	postLogoutRedirectUris: optionalOAuthURLArray.optional(),
	scopes: oauthScopesArray.optional(),
	uri: z.string().url().optional(),
	icon: z.string().url().optional(),
	tos: optionalOAuthURL,
	policy: optionalOAuthURL,
	public: z.boolean().optional(),
	skipConsent: z.boolean().optional(),
	enableEndSession: z.boolean().optional(),
	backchannelLogoutUri: z.string().url().nullable().optional(),
});

const updateOAuthClientSchema = createOAuthClientSchema
	.omit({
		public: true,
	})
	.partial()
	.refine((value) => Object.keys(value).length > 0, {
		message: "Provide at least one field to update.",
	});
const adminUserRoleSchema = z.object({
	role: z.enum(["user", "admin"]),
});
const adminUserBanSchema = z.object({
	banReason: z.string().trim().optional(),
	banExpiresIn: z.number().int().positive().optional(),
});
const accountPasswordSchema = z.object({
	currentPassword: z.string().optional(),
	newPassword: z.string().min(1),
});
const emailNotificationPreferenceSchema = z.object({
	securityAlerts: z.boolean(),
});
const webhookEventEnum = z.enum(
	WEBHOOK_EVENT_TYPE_VALUES as [string, ...string[]],
);
const createWebhookSchema = z.object({
	url: z.string().min(1),
	events: z.array(webhookEventEnum).min(1),
	description: z.string().max(200).optional(),
});
const updateWebhookSchema = z
	.object({
		events: z.array(webhookEventEnum).min(1).optional(),
		description: z.string().max(200).nullable().optional(),
		disabled: z.boolean().optional(),
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: "Provide at least one field to update.",
	});

function isAuthRoute(pathname: string) {
	return AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function routeTraceName(pathname: string) {
	if (isAuthRoute(pathname)) return "auth";
	if (pathname === "/.well-known/agent-configuration") return "agent-configuration";
	if (pathname === "/api/brand-config") return "brand-config";
	if (pathname === "/api/captcha-config") return "captcha-config";
	if (pathname === "/api/account/password") return "account-password";
	if (pathname === "/api/settings/notifications") return "notification-preferences";
	if (pathname === "/api/applications" || /^\/api\/applications\/[^/]+\/revoke$/.test(pathname)) {
		return "applications";
	}
	if (pathname === "/api/oauth/client-metadata") return "oauth-client-metadata";
	if (pathname.startsWith("/api/data-export-requests")) return "data-export";
	if (pathname === "/api/admin/oauth-clients") return "admin-oauth";
	if (pathname === "/api/admin/oauth-proxy") return "admin-oauth-proxy";
	if (pathname === "/api/admin/audit-events") return "admin-audit";
	if (pathname.startsWith("/api/admin/oauth-clients/")) return "admin-oauth";
	if (pathname.startsWith("/api/admin/users/")) return "admin-users";
	if (pathname === PROFILE_IMAGE_UPLOAD_PATH || pathname.startsWith(PROFILE_IMAGE_PATH_PREFIX)) {
		return "profile-images";
	}
	return "assets";
}

async function resolveWorkerResponse(response: WorkerResponse) {
	return (await response) ?? new Response(null, { status: 404 });
}

async function traceRequest(
	tracer: RequestTracer | undefined,
	request: Request,
	callback: () => WorkerResponse,
) {
	if (!tracer) return resolveWorkerResponse(callback());
	const route = routeTraceName(new URL(request.url).pathname);
	return tracer.enterSpan("passport.request", async (span) => {
		span.setAttribute("http.request.method", request.method);
		span.setAttribute("http.route", route);
		return resolveWorkerResponse(callback());
	});
}

function jsonError(message: string, status: number) {
	return Response.json({ error: message }, { status });
}

type APIErrorShape = {
	name?: unknown;
	statusCode?: unknown;
	body?: {
		message?: unknown;
	};
	message?: unknown;
};

function objectShape(value: unknown) {
	return value && typeof value === "object" ? (value as APIErrorShape) : null;
}

function adminOAuthErrorResponse(error: unknown) {
	console.error("Admin OAuth request failed", error);
	const shape = objectShape(error);
	const status =
		typeof shape?.statusCode === "number" && shape.statusCode >= 400 && shape.statusCode < 600
			? shape.statusCode
			: 500;
	const bodyMessage = shape?.body?.message;
	const errorMessage = shape?.message;
	const message =
		status < 500 && typeof bodyMessage === "string" && bodyMessage.trim()
			? bodyMessage
			: status < 500 && typeof errorMessage === "string" && errorMessage.trim()
				? errorMessage
				: "Could not manage OAuth client.";

	return jsonError(message, status);
}

async function adminOAuthResponse(callback: () => Response | Promise<Response>) {
	try {
		return await callback();
	} catch (error) {
		return adminOAuthErrorResponse(error);
	}
}

function parsePageInput(request: Request): { page: PageInput } | { response: Response } {
	const url = new URL(request.url);
	const limitValue = url.searchParams.get("limit");
	const cursorValue = url.searchParams.get("cursor");
	const limit = limitValue === null ? DEFAULT_PAGE_LIMIT : Number(limitValue);

	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
		return { response: jsonError("Invalid pagination parameters.", 400) };
	}

	if (cursorValue !== null && !/^\d+$/.test(cursorValue)) {
		return { response: jsonError("Invalid pagination parameters.", 400) };
	}

	return {
		page: {
			limit,
			...(cursorValue === null ? {} : { cursor: cursorValue }),
		},
	};
}

function pageMetadata<T>(page: PageInput, result: PageResult<T>) {
	return {
		limit: page.limit,
		...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
	};
}

function imageExtension(type: string) {
	return IMAGE_EXTENSIONS[type as keyof typeof IMAGE_EXTENSIONS];
}

function imagePurposeSegment(value: unknown) {
	if (value === null || value === "") return "";
	if (typeof value !== "string") return null;
	return PROFILE_IMAGE_PURPOSES.includes(value as (typeof PROFILE_IMAGE_PURPOSES)[number])
		? value
		: null;
}

function splitCSV(value: string | undefined) {
	return (
		value
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

function isAdmin(session: ProfileSession, env: Env) {
	return isAdminOperator(env as PublicEnv, session.user);
}

function safeCSSValue(value: string | undefined) {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed || /[;{}]/.test(trimmed)) return undefined;
	return trimmed;
}

function brandConfig(env: Env) {
	const publicEnv = env as PublicEnv;
	const theme = {
		brand: safeCSSValue(publicEnv.BRAND_COLOR),
		brandForeground: safeCSSValue(publicEnv.BRAND_FOREGROUND_COLOR),
		primary: safeCSSValue(publicEnv.PRIMARY_COLOR),
		primaryForeground: safeCSSValue(publicEnv.PRIMARY_FOREGROUND_COLOR),
		ring: safeCSSValue(publicEnv.RING_COLOR),
	};
	const cleanTheme = Object.fromEntries(
		Object.entries(theme).filter(([, value]) => Boolean(value)),
	) as Record<string, string>;
	return {
		name: publicEnv.BRAND_NAME?.trim() || DEFAULT_BRAND.name,
		descriptor: publicEnv.BRAND_DESCRIPTOR?.trim() || DEFAULT_BRAND.descriptor,
		...(publicEnv.BRAND_LOGO_SRC?.trim() ? { logoSrc: publicEnv.BRAND_LOGO_SRC.trim() } : {}),
		capabilities: splitCSV(publicEnv.BRAND_CAPABILITIES).length
			? splitCSV(publicEnv.BRAND_CAPABILITIES)
			: DEFAULT_BRAND.capabilities,
		...(Object.keys(cleanTheme).length ? { theme: cleanTheme } : {}),
	};
}

function captchaConfig(env: Env) {
	const publicEnv = env as PublicEnv;
	const secretKey = publicEnv.CAPTCHA_SECRET_KEY?.trim();
	const siteKey = publicEnv.CAPTCHA_SITE_KEY?.trim();
	if (!secretKey || !siteKey) {
		return { enabled: false };
	}
	return {
		enabled: true,
		provider: publicEnv.CAPTCHA_PROVIDER?.trim() || "cloudflare-turnstile",
		siteKey,
	};
}

async function requireSession(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	message: string,
) {
	const session = getSession ? await getSession(request, env) : null;
	if (!session) {
		return { response: jsonError(message, 401) };
	}
	return { session };
}

async function listApplications(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	applications: ApplicationService | undefined,
) {
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to manage applications.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!applications) return jsonError("Application management is not configured.", 501);

	const pageResult = parsePageInput(request);
	if ("response" in pageResult) return pageResult.response;

	const result = await applications.list({
		request,
		env,
		session: sessionResult.session,
	}, pageResult.page);
	return Response.json({
		applications: result.items,
		page: pageMetadata(pageResult.page, result),
	});
}

async function revokeApplication(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	applications: ApplicationService | undefined,
	consentId: string,
) {
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to manage applications.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!applications) return jsonError("Application management is not configured.", 501);

	await applications.revoke({
		request,
		env,
		session: sessionResult.session,
		consentId,
	});
	return Response.json({ ok: true });
}

async function requireAdmin(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminOAuth: AdminOAuthService | undefined,
) {
	const adminSession = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to manage OAuth clients.",
		"You do not have access to manage OAuth clients.",
	);
	if ("response" in adminSession) return { response: adminSession.response };
	if (!adminOAuth) return { response: jsonError("OAuth client management is not configured.", 501) };
	return {
		context: {
			request,
			env,
			session: adminSession.session,
		},
		adminOAuth,
	};
}

async function requireAdminSession(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	signInMessage: string,
	forbiddenMessage: string,
) {
	const sessionResult = await requireSession(request, env, getSession, signInMessage);
	if ("response" in sessionResult) return { response: sessionResult.response };
	if (!isAdmin(sessionResult.session, env)) {
		return { response: jsonError(forbiddenMessage, 403) };
	}
	return {
		session: sessionResult.session,
	};
}

async function handleAdminOAuthProxy(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
) {
	if (request.method !== "GET") return new Response(null, { status: 405 });

	const adminSession = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to view OAuth Proxy.",
		"You do not have access to view OAuth Proxy.",
	);
	if ("response" in adminSession) return adminSession.response;

	const publicEnv = env as PublicEnv;
	const requestURL = new URL(request.url);
	const currentURL = publicEnv.BETTER_AUTH_URL?.trim() || requestURL.origin;
	const productionURL = publicEnv.OAUTH_PROXY_PRODUCTION_URL?.trim() || currentURL;
	const sharedSecretConfigured = Boolean(publicEnv.OAUTH_PROXY_SECRET?.trim());
	const configured = Boolean(productionURL && sharedSecretConfigured);

	return Response.json({
		oauthProxy: {
			configured,
			productionURL,
			currentURL,
			sharedSecretConfigured,
			proxyActive: configured && productionURL !== currentURL,
			trustedOrigins: splitCSV(publicEnv.TRUSTED_ORIGINS),
			callbackPath: "/api/auth/callback/:provider",
		},
	});
}

async function readJSON(request: Request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

async function recordAdminAudit(
	audit: AdminAuditService | undefined,
	context: ApplicationContext,
	input: AdminAuditEventInput,
) {
	if (!audit) return;
	await audit.record(context, input);
}

async function handleOAuthClientMetadata(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	clientMetadata: OAuthClientMetadataService | undefined,
) {
	if (request.method !== "GET") return new Response(null, { status: 405 });
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to view OAuth client metadata.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!clientMetadata) return jsonError("OAuth client metadata is not configured.", 501);

	const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
	if (!clientId) return jsonError("Missing clientId.", 400);

	const client = await clientMetadata.resolve(
		{
			request,
			env,
			session: sessionResult.session,
		},
		clientId,
	);
	if (!client) return jsonError("OAuth client not found.", 404);
	return Response.json({ client });
}

async function handleAdminAuditEvents(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminAudit: AdminAuditService | undefined,
) {
	if (request.method !== "GET") return new Response(null, { status: 405 });
	const adminSession = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to view audit events.",
		"You do not have access to view audit events.",
	);
	if ("response" in adminSession) return adminSession.response;
	if (!adminAudit) return jsonError("Admin audit is not configured.", 501);

	const pageResult = parsePageInput(request);
	if ("response" in pageResult) return pageResult.response;
	const result = await adminAudit.list(
		{
			request,
			env,
			session: adminSession.session,
		},
		pageResult.page,
	);
	return Response.json({
		events: result.items,
		page: pageMetadata(pageResult.page, result),
	});
}

async function handleAccountActivity(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	activityLog: AccountActivityService | undefined,
) {
	if (request.method !== "GET") return new Response(null, { status: 405 });
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to view your account activity.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!activityLog) return jsonError("Account activity is not configured.", 501);

	const pageResult = parsePageInput(request);
	if ("response" in pageResult) return pageResult.response;
	const result = await activityLog.list(
		{
			request,
			env,
			session: sessionResult.session,
		},
		pageResult.page,
	);
	return Response.json({
		events: result.items,
		page: pageMetadata(pageResult.page, result),
	});
}

async function handleAdminWebhooks(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	webhooks: WebhookService | undefined,
) {
	const admin = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to manage webhooks.",
		"You do not have access to manage webhooks.",
	);
	if ("response" in admin) return admin.response;
	if (!webhooks) return jsonError("Webhooks are not configured.", 501);
	const context = { request, env, session: admin.session };

	if (request.method === "GET") {
		const pageResult = parsePageInput(request);
		if ("response" in pageResult) return pageResult.response;
		const result = await webhooks.list(context, pageResult.page);
		return Response.json({
			endpoints: result.items,
			page: pageMetadata(pageResult.page, result),
		});
	}

	if (request.method === "POST") {
		const parsed = createWebhookSchema.safeParse(await readJSON(request));
		if (!parsed.success) {
			return jsonError(parsed.error.issues[0]?.message ?? "Invalid webhook.", 400);
		}
		const url = safeWebhookURL(parsed.data.url);
		if (!url) {
			return jsonError("Webhook URL must be an absolute https URL to a public host.", 400);
		}
		const endpoint = await webhooks.create(context, { ...parsed.data, url });
		return Response.json({ endpoint }, { status: 201 });
	}

	return new Response(null, { status: 405 });
}

async function handleAdminWebhookAction(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	webhooks: WebhookService | undefined,
	id: string,
	action: string | undefined,
) {
	const admin = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to manage webhooks.",
		"You do not have access to manage webhooks.",
	);
	if ("response" in admin) return admin.response;
	if (!webhooks) return jsonError("Webhooks are not configured.", 501);
	const context = { request, env, session: admin.session };

	if (action === "deliveries") {
		if (request.method !== "GET") return new Response(null, { status: 405 });
		const pageResult = parsePageInput(request);
		if ("response" in pageResult) return pageResult.response;
		const result = await webhooks.listDeliveries(context, id, pageResult.page);
		return Response.json({
			deliveries: result.items,
			page: pageMetadata(pageResult.page, result),
		});
	}

	if (action === "rotate-secret") {
		if (request.method !== "POST") return new Response(null, { status: 405 });
		const endpoint = await webhooks.rotateSecret(context, id);
		if (!endpoint) return jsonError("Webhook endpoint not found.", 404);
		return Response.json({ endpoint });
	}

	if (action) return new Response(null, { status: 404 });

	if (request.method === "PATCH") {
		const parsed = updateWebhookSchema.safeParse(await readJSON(request));
		if (!parsed.success) {
			return jsonError(parsed.error.issues[0]?.message ?? "Invalid update.", 400);
		}
		const endpoint = await webhooks.update(context, id, parsed.data);
		if (!endpoint) return jsonError("Webhook endpoint not found.", 404);
		return Response.json({ endpoint });
	}

	if (request.method === "DELETE") {
		const removed = await webhooks.remove(context, id);
		if (!removed) return jsonError("Webhook endpoint not found.", 404);
		return new Response(null, { status: 204 });
	}

	return new Response(null, { status: 405 });
}

async function updateAccountPassword(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	accountPassword: AccountPasswordService | undefined,
) {
	if (request.method !== "POST") return new Response(null, { status: 405 });
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to update your password.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!accountPassword) return jsonError("Password management is not configured.", 501);

	const parsed = accountPasswordSchema.safeParse(await readJSON(request));
	if (!parsed.success) return jsonError("Invalid password update request.", 400);

	return accountPassword.update(
		{
			request,
			env,
			session: sessionResult.session,
		},
		parsed.data,
	);
}

async function handleEmailNotificationPreferences(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	preferences: EmailNotificationPreferenceService | undefined,
) {
	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to manage notification settings.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!preferences) {
		if (request.method === "GET") {
			return Response.json({ preferences: DEFAULT_EMAIL_NOTIFICATION_PREFERENCES });
		}
		return jsonError("Notification settings are not configured.", 501);
	}

	const context = {
		request,
		env,
		session: sessionResult.session,
	};

	if (request.method === "GET") {
		return Response.json({ preferences: await preferences.get(context) });
	}

	if (request.method === "PATCH") {
		const parsed = emailNotificationPreferenceSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError("Invalid notification preferences.", 400);
		return Response.json({ preferences: await preferences.update(context, parsed.data) });
	}

	return new Response(null, { status: 405 });
}

async function handleDataExportCollection(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	dataExports: DataExportService | undefined,
) {
	if (request.method !== "POST") return new Response(null, { status: 405 });

	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to request your account data.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!dataExports) return jsonError("Data exports are not configured.", 501);

	const context = {
		request,
		env,
		session: sessionResult.session,
	};

	return Response.json({ request: await dataExports.request(context) }, { status: 202 });
}

async function handleCurrentDataExport(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	dataExports: DataExportService | undefined,
) {
	if (request.method !== "GET") return new Response(null, { status: 405 });

	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to request your account data.",
	);
	if ("response" in sessionResult) return sessionResult.response;
	if (!dataExports) return jsonError("Data exports are not configured.", 501);

	return Response.json({
		request: await dataExports.current({
			request,
			env,
			session: sessionResult.session,
		}),
	});
}

async function handleDataExportCancel(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	dataExports: DataExportService | undefined,
	requestId: string,
) {
	if (!dataExports) return jsonError("Data exports are not configured.", 501);

	const token = new URL(request.url).searchParams.get("token");
	if (token || request.method === "GET") {
		return dataExports.cancelWithToken(request, env, requestId);
	}

	if (request.method !== "POST") return new Response(null, { status: 405 });

	const sessionResult = await requireSession(
		request,
		env,
		getSession,
		"Sign in to cancel your account data request.",
	);
	if ("response" in sessionResult) return sessionResult.response;

	const canceled = await dataExports.cancel(
		{
			request,
			env,
			session: sessionResult.session,
		},
		requestId,
	);
	if (!canceled) return jsonError("Data export request cannot be canceled.", 409);
	return Response.json({ request: canceled });
}

async function handleAdminOAuthClients(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminOAuth: AdminOAuthService | undefined,
	adminAudit: AdminAuditService | undefined,
) {
	const admin = await requireAdmin(request, env, getSession, adminOAuth);
	if ("response" in admin) return admin.response;

	if (request.method === "GET") {
		const pageResult = parsePageInput(request);
		if ("response" in pageResult) return pageResult.response;
		return adminOAuthResponse(async () => {
			const result = await admin.adminOAuth.list(admin.context, pageResult.page);
			return Response.json({
				clients: result.items,
				page: pageMetadata(pageResult.page, result),
			});
		});
	}

	if (request.method === "POST") {
		const parsed = createOAuthClientSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid client.", 400);
		return adminOAuthResponse(async () => {
			const client = await admin.adminOAuth.create(admin.context, parsed.data);
			await recordAdminAudit(adminAudit, admin.context, {
				action: ADMIN_AUDIT_ACTIONS.OAUTH_CLIENT_CREATE,
				targetType: ADMIN_AUDIT_TARGET_TYPES.OAUTH_CLIENT,
				targetId: client.clientId,
				targetLabel: client.name,
				metadata: {
					redirectUris: client.redirectUris,
					scopes: client.scopes,
					public: client.public,
					skipConsent: client.skipConsent,
					enableEndSession: client.enableEndSession,
				},
			});
			return Response.json({ client }, { status: 201 });
		});
	}

	return new Response(null, { status: 405 });
}

async function handleAdminOAuthClientAction(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminOAuth: AdminOAuthService | undefined,
	adminAudit: AdminAuditService | undefined,
	clientId: string,
	action: string | undefined,
) {
	const admin = await requireAdmin(request, env, getSession, adminOAuth);
	if ("response" in admin) return admin.response;

	if (request.method === "PATCH" && !action) {
		const parsed = updateOAuthClientSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid client.", 400);
		return adminOAuthResponse(async () => {
			const client = await admin.adminOAuth.update(admin.context, clientId, parsed.data);
			await recordAdminAudit(adminAudit, admin.context, {
				action: ADMIN_AUDIT_ACTIONS.OAUTH_CLIENT_UPDATE,
				targetType: ADMIN_AUDIT_TARGET_TYPES.OAUTH_CLIENT,
				targetId: client.clientId,
				targetLabel: client.name,
				metadata: {
					update: parsed.data,
				},
			});
			return Response.json({ client });
		});
	}

	if (request.method !== "POST") return new Response(null, { status: 405 });

	if (action === "rotate-secret") {
		return adminOAuthResponse(async () => {
			const client = await admin.adminOAuth.rotateSecret(admin.context, clientId);
			await recordAdminAudit(adminAudit, admin.context, {
				action: ADMIN_AUDIT_ACTIONS.OAUTH_CLIENT_ROTATE_SECRET,
				targetType: ADMIN_AUDIT_TARGET_TYPES.OAUTH_CLIENT,
				targetId: client.clientId,
				targetLabel: client.name,
				metadata: {
					rotated: true,
				},
			});
			return Response.json({ client });
		});
	}
	if (action === "disable" || action === "enable") {
		return adminOAuthResponse(async () => {
			const client = await admin.adminOAuth.setDisabled(admin.context, clientId, action === "disable");
			await recordAdminAudit(adminAudit, admin.context, {
				action:
					action === "disable"
						? ADMIN_AUDIT_ACTIONS.OAUTH_CLIENT_DISABLE
						: ADMIN_AUDIT_ACTIONS.OAUTH_CLIENT_ENABLE,
				targetType: ADMIN_AUDIT_TARGET_TYPES.OAUTH_CLIENT,
				targetId: client.clientId,
				targetLabel: client.name,
				metadata: {
					disabled: action === "disable",
				},
			});
			return Response.json({ client });
		});
	}

	return new Response(null, { status: 404 });
}

async function handleAdminUserAction(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminUsers: AdminUserService | undefined,
	adminAudit: AdminAuditService | undefined,
	userId: string,
	action: string | undefined,
) {
	const adminSession = await requireAdminSession(
		request,
		env,
		getSession,
		"Sign in to manage users.",
		"You do not have access to manage users.",
	);
	if ("response" in adminSession) return adminSession.response;
	if (!adminUsers) return jsonError("Admin user management is not configured.", 501);
	if (request.method !== "POST") return new Response(null, { status: 405 });

	const context = {
		request,
		env,
		session: adminSession.session,
	};

	if (action === "role") {
		const parsed = adminUserRoleSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid role.", 400);
		const user = await adminUsers.setRole(context, userId, parsed.data.role);
		await recordAdminAudit(adminAudit, context, {
			action: ADMIN_AUDIT_ACTIONS.USER_SET_ROLE,
			targetType: ADMIN_AUDIT_TARGET_TYPES.USER,
			targetId: user.userId,
			targetLabel: user.email,
			metadata: {
				role: parsed.data.role,
			},
		});
		return Response.json({ user });
	}

	if (action === "ban") {
		const parsed = adminUserBanSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid ban.", 400);
		const user = await adminUsers.ban(context, userId, parsed.data);
		await recordAdminAudit(adminAudit, context, {
			action: ADMIN_AUDIT_ACTIONS.USER_BAN,
			targetType: ADMIN_AUDIT_TARGET_TYPES.USER,
			targetId: user.userId,
			targetLabel: user.email,
			metadata: {
				banReason: parsed.data.banReason,
				banExpiresIn: parsed.data.banExpiresIn,
			},
		});
		return Response.json({ user });
	}

	if (action === "unban") {
		const user = await adminUsers.unban(context, userId);
		await recordAdminAudit(adminAudit, context, {
			action: ADMIN_AUDIT_ACTIONS.USER_UNBAN,
			targetType: ADMIN_AUDIT_TARGET_TYPES.USER,
			targetId: user.userId,
			targetLabel: user.email,
		});
		return Response.json({ user });
	}

	return new Response(null, { status: 404 });
}

async function uploadProfileImage(request: Request, env: Env, getSession?: SessionResolver) {
	const session = getSession ? await getSession(request, env) : null;
	if (!session) {
		return jsonError("Sign in to upload a profile image.", 401);
	}

	const body = await request.formData();
	const image = body.get("image");
	if (!(image instanceof File)) {
		return jsonError("Choose an image file to upload.", 400);
	}

	const extension = imageExtension(image.type);
	if (!extension) {
		return jsonError("Profile image must be a PNG, JPG, GIF, or WebP file.", 400);
	}

	if (image.size > MAX_PROFILE_IMAGE_BYTES) {
		return jsonError("Profile image must be 2 MB or smaller.", 413);
	}

	const purpose = imagePurposeSegment(body.get("purpose"));
	if (purpose === null) {
		return jsonError(
			"Image purpose must be profile, organization-logo, team-logo, or application-picture.",
			400,
		);
	}

	const userPath = `${PROFILE_IMAGE_KEY_PREFIX}/${encodeURIComponent(session.user.id)}`;
	const purposePath = purpose ? `${purpose}/` : "";
	const key = `${userPath}/${purposePath}${crypto.randomUUID()}.${extension}`;
	await env.PROFILE_IMAGES.put(key, image, {
		httpMetadata: {
			contentType: image.type,
		},
	});

	const imageURL = `${PROFILE_IMAGE_PATH_PREFIX}${key}`;
	return Response.json({
		image: imageURL,
		url: imageURL,
	});
}

async function serveProfileImage(pathname: string, env: Env) {
	const key = pathname.slice(PROFILE_IMAGE_PATH_PREFIX.length);
	if (!key.startsWith(`${PROFILE_IMAGE_KEY_PREFIX}/`)) {
		return new Response(null, { status: 404 });
	}

	const object = await env.PROFILE_IMAGES.get(key);
	if (!object) {
		return new Response(null, { status: 404 });
	}

	if (object instanceof Response) {
		const headers = new Headers(object.headers);
		headers.set("cache-control", "public, max-age=31536000, immutable");
		return new Response(object.body, {
			status: object.status,
			statusText: object.statusText,
			headers,
		});
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");

	return new Response(object.body, { headers });
}

export function createWorkerApp({
	authHandler,
	tracer,
	agentConfiguration,
	getSession,
	applications,
	clientMetadata,
	adminOAuth,
	adminAudit,
	adminUsers,
	accountPassword,
	dataExports,
	emailNotificationPreferences,
	activityLog,
	webhooks,
}: AppOptions) {
	const app = new Hono<{ Bindings: Env }>();

	app.all("*", async (c) => {
		const request = c.req.raw;
		return traceRequest(tracer, request, async () => {
			const url = new URL(request.url);

			if (url.pathname === "/api/brand-config" && request.method === "GET") {
				return Response.json(brandConfig(c.env), {
					headers: {
						"cache-control": "public, max-age=60",
					},
				});
			}

			if (url.pathname === "/api/captcha-config" && request.method === "GET") {
				return Response.json(captchaConfig(c.env), {
					headers: {
						"cache-control": "public, max-age=60",
					},
				});
			}

			if (url.pathname === "/.well-known/agent-configuration") {
				if (request.method !== "GET") return new Response(null, { status: 405 });
				if (!agentConfiguration) {
					return jsonError("Agent auth discovery is not configured.", 501);
				}
				const configuration = await agentConfiguration({ request, env: c.env });
				return Response.json(configuration);
			}

			if (url.pathname === PROFILE_IMAGE_UPLOAD_PATH && request.method === "POST") {
				return uploadProfileImage(request, c.env, getSession);
			}

			if (url.pathname.startsWith(PROFILE_IMAGE_PATH_PREFIX) && request.method === "GET") {
				return serveProfileImage(url.pathname, c.env);
			}

			if (url.pathname === "/api/applications" && request.method === "GET") {
				return listApplications(request, c.env, getSession, applications);
			}

			if (url.pathname === "/api/oauth/client-metadata") {
				return handleOAuthClientMetadata(request, c.env, getSession, clientMetadata);
			}

			if (url.pathname === "/api/account/password") {
				return updateAccountPassword(request, c.env, getSession, accountPassword);
			}

			if (url.pathname === "/api/account/activity") {
				return handleAccountActivity(request, c.env, getSession, activityLog);
			}

			if (url.pathname === "/api/settings/notifications") {
				return handleEmailNotificationPreferences(
					request,
					c.env,
					getSession,
					emailNotificationPreferences,
				);
			}

			if (url.pathname === "/api/data-export-requests/current") {
				return handleCurrentDataExport(request, c.env, getSession, dataExports);
			}

			if (url.pathname === "/api/data-export-requests") {
				return handleDataExportCollection(request, c.env, getSession, dataExports);
			}

			const dataExportActionMatch = url.pathname.match(
				/^\/api\/data-export-requests\/([^/]+)\/(cancel|download)$/,
			);
			if (dataExportActionMatch) {
				const requestId = decodeURIComponent(dataExportActionMatch[1] ?? "");
				const action = dataExportActionMatch[2];
				if (action === "cancel") {
					return handleDataExportCancel(request, c.env, getSession, dataExports, requestId);
				}
				if (action === "download") {
					if (!dataExports) return jsonError("Data exports are not configured.", 501);
					return dataExports.downloadWithToken(request, c.env, requestId);
				}
				return new Response(null, { status: 404 });
			}

			const applicationRevokeMatch = url.pathname.match(
				/^\/api\/applications\/([^/]+)\/revoke$/,
			);
			if (applicationRevokeMatch && request.method === "POST") {
				return revokeApplication(
					request,
					c.env,
					getSession,
					applications,
					decodeURIComponent(applicationRevokeMatch[1] ?? ""),
				);
			}

			if (url.pathname === "/api/admin/oauth-clients") {
				return handleAdminOAuthClients(request, c.env, getSession, adminOAuth, adminAudit);
			}

			if (url.pathname === "/api/admin/oauth-proxy") {
				return handleAdminOAuthProxy(request, c.env, getSession);
			}

			if (url.pathname === "/api/admin/audit-events") {
				return handleAdminAuditEvents(request, c.env, getSession, adminAudit);
			}

			if (url.pathname === "/api/admin/webhooks") {
				return handleAdminWebhooks(request, c.env, getSession, webhooks);
			}

			const adminWebhookMatch = url.pathname.match(
				/^\/api\/admin\/webhooks\/([^/]+)(?:\/([^/]+))?$/,
			);
			if (adminWebhookMatch) {
				return handleAdminWebhookAction(
					request,
					c.env,
					getSession,
					webhooks,
					decodeURIComponent(adminWebhookMatch[1] ?? ""),
					adminWebhookMatch[2] ? decodeURIComponent(adminWebhookMatch[2]) : undefined,
				);
			}

			const adminOAuthMatch = url.pathname.match(
				/^\/api\/admin\/oauth-clients\/([^/]+)(?:\/([^/]+))?$/,
			);
			if (adminOAuthMatch) {
				return handleAdminOAuthClientAction(
					request,
					c.env,
					getSession,
					adminOAuth,
					adminAudit,
					decodeURIComponent(adminOAuthMatch[1] ?? ""),
					adminOAuthMatch[2] ? decodeURIComponent(adminOAuthMatch[2]) : undefined,
				);
			}

			const adminUserMatch = url.pathname.match(
				/^\/api\/admin\/users\/([^/]+)\/([^/]+)$/,
			);
			if (adminUserMatch) {
				return handleAdminUserAction(
					request,
					c.env,
					getSession,
					adminUsers,
					adminAudit,
					decodeURIComponent(adminUserMatch[1] ?? ""),
					adminUserMatch[2] ? decodeURIComponent(adminUserMatch[2]) : undefined,
				);
			}

			if (isAuthRoute(url.pathname)) {
				return authHandler(request, c.env);
			}

			return c.env.ASSETS.fetch(request);
		});
	});

	return app;
}
