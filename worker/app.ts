import { Hono } from "hono";
import { z } from "zod";

type AuthHandler = (request: Request, env: Env) => Response | Promise<Response>;
type ProfileSession = {
	user: {
		id: string;
		email?: string | null;
		name?: string | null;
		image?: string | null;
	};
};
type SessionResolver = (request: Request, env: Env) => ProfileSession | null | Promise<ProfileSession | null>;

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

export type ApplicationService = {
	list: (context: ApplicationContext) => ApplicationSummary[] | Promise<ApplicationSummary[]>;
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
	public?: boolean;
	disabled?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
};

export type OAuthClientWithSecret = OAuthClientSummary & {
	clientSecret?: string;
};

type AdminOAuthContext = ApplicationContext;

export type CreateOAuthClientInput = {
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	scopes?: string[];
	uri?: string;
	icon?: string;
	public?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
};

export type UpdateOAuthClientInput = Partial<Omit<CreateOAuthClientInput, "public">>;

export type AdminOAuthService = {
	list: (context: AdminOAuthContext) => OAuthClientSummary[] | Promise<OAuthClientSummary[]>;
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
	agentConfiguration?: AgentConfigurationResolver;
	getSession?: SessionResolver;
	applications?: ApplicationService;
	adminOAuth?: AdminOAuthService;
};

const AUTH_PATH_PREFIXES = [
	"/api/auth/",
	"/oauth2/",
	"/.well-known/oauth-authorization-server",
	"/.well-known/openid-configuration",
];
const PROFILE_IMAGE_PATH_PREFIX = "/api/profile-images/";
const PROFILE_IMAGE_UPLOAD_PATH = "/api/profile-images";
const PROFILE_IMAGE_KEY_PREFIX = "profile-images";
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
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
	BRAND_ABBREVIATION?: string;
	BRAND_DESCRIPTOR?: string;
	BRAND_LOGO_SRC?: string;
	BRAND_CAPABILITIES?: string;
	BRAND_COLOR?: string;
	BRAND_FOREGROUND_COLOR?: string;
	PRIMARY_COLOR?: string;
	PRIMARY_FOREGROUND_COLOR?: string;
	RING_COLOR?: string;
};

const DEFAULT_BRAND = {
	name: "Passport",
	abbreviation: "PP",
	descriptor: "Identity provider",
	capabilities: ["OIDC", "PKCE", "JWKS"],
};

const oauthURLArray = z.array(z.string().url()).min(1);

const createOAuthClientSchema = z.object({
	name: z.string().trim().min(1),
	redirectUris: oauthURLArray,
	postLogoutRedirectUris: oauthURLArray.optional(),
	scopes: z.array(z.string().trim().min(1)).optional(),
	uri: z.string().url().optional(),
	icon: z.string().url().optional(),
	public: z.boolean().optional(),
	skipConsent: z.boolean().optional(),
	enableEndSession: z.boolean().optional(),
});

const updateOAuthClientSchema = createOAuthClientSchema
	.omit({
		public: true,
	})
	.partial()
	.refine((value) => Object.keys(value).length > 0, {
		message: "Provide at least one field to update.",
	});

function isAuthRoute(pathname: string) {
	return AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function jsonError(message: string, status: number) {
	return Response.json({ error: message }, { status });
}

function imageExtension(type: string) {
	return IMAGE_EXTENSIONS[type as keyof typeof IMAGE_EXTENSIONS];
}

function splitCSV(value: string | undefined) {
	return (
		value
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

function normalizeEmail(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? "";
}

function isAdmin(session: ProfileSession, env: Env) {
	const adminEmails = splitCSV((env as PublicEnv).ADMIN_EMAILS).map((email) =>
		normalizeEmail(email),
	);
	return adminEmails.includes(normalizeEmail(session.user.email));
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
		abbreviation: publicEnv.BRAND_ABBREVIATION?.trim() || DEFAULT_BRAND.abbreviation,
		descriptor: publicEnv.BRAND_DESCRIPTOR?.trim() || DEFAULT_BRAND.descriptor,
		...(publicEnv.BRAND_LOGO_SRC?.trim() ? { logoSrc: publicEnv.BRAND_LOGO_SRC.trim() } : {}),
		capabilities: splitCSV(publicEnv.BRAND_CAPABILITIES).length
			? splitCSV(publicEnv.BRAND_CAPABILITIES)
			: DEFAULT_BRAND.capabilities,
		...(Object.keys(cleanTheme).length ? { theme: cleanTheme } : {}),
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

	const summaries = await applications.list({
		request,
		env,
		session: sessionResult.session,
	});
	return Response.json({ applications: summaries });
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

async function handleAdminOAuthClients(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminOAuth: AdminOAuthService | undefined,
) {
	const admin = await requireAdmin(request, env, getSession, adminOAuth);
	if ("response" in admin) return admin.response;

	if (request.method === "GET") {
		const clients = await admin.adminOAuth.list(admin.context);
		return Response.json({ clients });
	}

	if (request.method === "POST") {
		const parsed = createOAuthClientSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid client.", 400);
		const client = await admin.adminOAuth.create(admin.context, parsed.data);
		return Response.json({ client }, { status: 201 });
	}

	return new Response(null, { status: 405 });
}

async function handleAdminOAuthClientAction(
	request: Request,
	env: Env,
	getSession: SessionResolver | undefined,
	adminOAuth: AdminOAuthService | undefined,
	clientId: string,
	action: string | undefined,
) {
	const admin = await requireAdmin(request, env, getSession, adminOAuth);
	if ("response" in admin) return admin.response;

	if (request.method === "PATCH" && !action) {
		const parsed = updateOAuthClientSchema.safeParse(await readJSON(request));
		if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid client.", 400);
		const client = await admin.adminOAuth.update(admin.context, clientId, parsed.data);
		return Response.json({ client });
	}

	if (request.method !== "POST") return new Response(null, { status: 405 });

	if (action === "rotate-secret") {
		const client = await admin.adminOAuth.rotateSecret(admin.context, clientId);
		return Response.json({ client });
	}
	if (action === "disable" || action === "enable") {
		const client = await admin.adminOAuth.setDisabled(admin.context, clientId, action === "disable");
		return Response.json({ client });
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

	const key = `${PROFILE_IMAGE_KEY_PREFIX}/${encodeURIComponent(session.user.id)}/${crypto.randomUUID()}.${extension}`;
	await env.PROFILE_IMAGES.put(key, image, {
		httpMetadata: {
			contentType: image.type,
		},
	});

	return Response.json({
		image: `${PROFILE_IMAGE_PATH_PREFIX}${key}`,
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
	agentConfiguration,
	getSession,
	applications,
	adminOAuth,
}: AppOptions) {
	const app = new Hono<{ Bindings: Env }>();

	app.all("*", async (c) => {
			const request = c.req.raw;
			const url = new URL(request.url);

			if (url.pathname === "/api/brand-config" && request.method === "GET") {
				return Response.json(brandConfig(c.env), {
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
				return handleAdminOAuthClients(request, c.env, getSession, adminOAuth);
			}

			if (url.pathname === "/api/admin/oauth-proxy") {
				return handleAdminOAuthProxy(request, c.env, getSession);
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
					decodeURIComponent(adminOAuthMatch[1] ?? ""),
					adminOAuthMatch[2] ? decodeURIComponent(adminOAuthMatch[2]) : undefined,
				);
			}

			if (isAuthRoute(url.pathname)) {
				return authHandler(request, c.env);
			}

		return c.env.ASSETS.fetch(request);
	});

	return app;
}
