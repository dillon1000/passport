/**
 * Applications dashboard page: shows OAuth consents for the signed-in user and
 * admin-managed OAuth clients when the session has access. The page consumes
 * paginated Worker APIs and keeps client edit drafts local until an admin saves.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
	AppWindow,
	ArrowRight,
	Ban,
	Check,
	CheckCircle2,
	ChevronDown,
	Copy,
	FileJson,
	Globe,
	Network,
	Plus,
	RefreshCw,
	RotateCcw,
	Save,
} from "lucide-react";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField, Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { Segmented, type SegmentedOption } from "@/components/auth/segmented";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot, type DotTone } from "@/components/auth/status-dot";
import { SummaryRow } from "@/components/auth/summary-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetBody,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { hasAdminRole } from "@/lib/admin-access";
import { copyTextToClipboard } from "@/lib/clipboard";
import { uploadImageAsset } from "@/lib/image-upload";
import { defaultClientScopeString, supportedScopeString } from "@/lib/oauth-scopes";
import { fetchAPIJSON, queryKeys, readAPIJSON } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [
	{ id: "authorized", label: "Authorized" },
	{ id: "clients", label: "Clients" },
	{ id: "oauth-proxy", label: "OAuth Proxy" },
];

// Keep page requests aligned with the Worker default so refreshes and appends use the same slice size.
const PAGE_LIMIT = 25;
const DEFAULT_CLIENT_SCOPE_STRING = defaultClientScopeString();
const SUPPORTED_SCOPE_HINT = `Supported: ${supportedScopeString()}`;
type ClientType = "browser" | "m2m";
const CLIENT_TYPE_OPTIONS: SegmentedOption<ClientType>[] = [
	{ value: "browser", label: "Browser app", icon: AppWindow },
	{ value: "m2m", label: "M2M", icon: Network },
];

type AuthorizedApplication = {
	consentId: string;
	clientId: string;
	name: string;
	icon?: string | null;
	uri?: string | null;
	scopes: string[];
	authorizedAt?: string | null;
	updatedAt?: string | null;
};

type OAuthClientSummary = {
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
	grantTypes?: ("authorization_code" | "client_credentials" | "refresh_token")[];
	allowedAudiences?: string[];
	clientSecret?: string;
};

type ClientDraft = {
	clientType: ClientType;
	name: string;
	redirectUris: string;
	postLogoutRedirectUris: string;
	scopes: string;
	allowedAudiences: string;
	uri: string;
	icon: string;
	tos: string;
	policy: string;
	skipConsent: boolean;
	enableEndSession: boolean;
	backchannelLogoutUri: string;
};

type OAuthProxyStatus = {
	configured: boolean;
	productionURL: string;
	currentURL: string;
	sharedSecretConfigured: boolean;
	proxyActive: boolean;
	trustedOrigins: string[];
	callbackPath: string;
};

type PagePayload = {
	limit: number;
	nextCursor?: string;
};

type ApplicationsPagePayload = {
	applications: AuthorizedApplication[];
	page?: PagePayload;
};

type OAuthClientsPagePayload = {
	clients: OAuthClientSummary[];
	page?: PagePayload;
	adminAvailable: boolean;
};

type CreateClientStep = "details" | "policies";
type ApplicationsSessionUser = {
	role?: string | null;
};

// Discovery document served at /.well-known/openid-configuration. Only the
// fields we surface as copyable rows are typed; the rest round-trip as unknown.
type OIDCConfiguration = {
	issuer?: string;
	authorization_endpoint?: string;
	token_endpoint?: string;
	userinfo_endpoint?: string;
	jwks_uri?: string;
	registration_endpoint?: string;
	revocation_endpoint?: string;
	introspection_endpoint?: string;
	end_session_endpoint?: string;
	scopes_supported?: string[];
	[key: string]: unknown;
};

// Endpoints shown in the discovery drawer, in the order a client developer
// typically wires them up. Rows are skipped when the document omits a field.
const OIDC_ENDPOINT_ROWS: { key: string; label: string }[] = [
	{ key: "issuer", label: "Issuer" },
	{ key: "authorization_endpoint", label: "Authorization endpoint" },
	{ key: "token_endpoint", label: "Token endpoint" },
	{ key: "userinfo_endpoint", label: "Userinfo endpoint" },
	{ key: "jwks_uri", label: "JWKS URI" },
	{ key: "registration_endpoint", label: "Registration endpoint" },
	{ key: "revocation_endpoint", label: "Revocation endpoint" },
	{ key: "introspection_endpoint", label: "Introspection endpoint" },
	{ key: "end_session_endpoint", label: "End session endpoint" },
];

// Better Auth serves discovery under its base path, not the bare root.
const OIDC_DISCOVERY_PATH = "/api/auth/.well-known/openid-configuration";

function canShowManagedOAuthClients(
	user: ApplicationsSessionUser | null | undefined,
	state: { adminAvailable: boolean },
) {
	return hasAdminRole(user) || state.adminAvailable;
}

// The discovery document an external client should fetch lives at the issuer's
// well-known path. Fall back to this origin before the document has loaded.
function oidcDiscoveryURL(config: OIDCConfiguration | null) {
	if (config?.issuer) {
		return `${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
	}
	return `${window.location.origin}${OIDC_DISCOVERY_PATH}`;
}

function lines(value: string) {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function scopeList(value: string) {
	return value
		.split(/[,\s]+/)
		.map((scope) => scope.trim())
		.filter(Boolean);
}

function clientTypeFromGrantTypes(grantTypes?: readonly string[]): ClientType {
	return grantTypes?.includes("client_credentials") ? "m2m" : "browser";
}

function grantTypesForClientType(clientType: ClientType) {
	return clientType === "m2m"
		? ["client_credentials"]
		: ["authorization_code", "refresh_token"];
}

function clientDraft(client?: OAuthClientSummary): ClientDraft {
	return {
		clientType: clientTypeFromGrantTypes(client?.grantTypes),
		name: client?.name ?? "",
		redirectUris: client?.redirectUris.join("\n") ?? "",
		postLogoutRedirectUris: client?.postLogoutRedirectUris?.join("\n") ?? "",
		scopes: client?.scopes?.join(" ") ?? DEFAULT_CLIENT_SCOPE_STRING,
		allowedAudiences: client?.allowedAudiences?.join("\n") ?? "",
		uri: client?.uri ?? "",
		icon: client?.icon ?? "",
		tos: client?.tos ?? "",
		policy: client?.policy ?? "",
		skipConsent: Boolean(client?.skipConsent),
		enableEndSession: Boolean(client?.enableEndSession),
		backchannelLogoutUri: client?.backchannelLogoutUri ?? "",
	};
}

function pageURL(pathname: string, cursor: string | null) {
	const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
	if (cursor) {
		params.set("cursor", cursor);
	}
	return `${pathname}?${params.toString()}`;
}

async function fetchApplicationsPage(cursor: string | null): Promise<ApplicationsPagePayload> {
	return fetchAPIJSON<ApplicationsPagePayload>(pageURL("/api/applications", cursor));
}

async function fetchOAuthClientsPage(cursor: string | null): Promise<OAuthClientsPagePayload> {
	const response = await fetch(pageURL("/api/admin/oauth-clients", cursor));
	if (response.status === 403 || response.status === 401) {
		return { clients: [], adminAvailable: false };
	}
	const payload = await readAPIJSON<Omit<OAuthClientsPagePayload, "adminAvailable">>(response);
	return { ...payload, adminAvailable: true };
}

async function fetchOAuthProxyStatus() {
	const response = await fetch("/api/admin/oauth-proxy");
	if (response.status === 403 || response.status === 401) return null;
	if (!response.ok) return null;
	const payload = (await response.json()) as { oauthProxy: OAuthProxyStatus };
	return payload.oauthProxy;
}

async function fetchOIDCConfiguration() {
	return fetchAPIJSON<OIDCConfiguration>(OIDC_DISCOVERY_PATH, {
		headers: { accept: "application/json" },
	});
}

function formatDate(value?: string | null) {
	if (!value) return "Unknown";
	return new Date(value).toLocaleString();
}

export function Applications() {
	const { data: session } = useRequireSession();
	const [clientDrafts, setClientDrafts] = useState<Record<string, ClientDraft>>({});
	const [newClient, setNewClient] = useState<ClientDraft>(() => clientDraft());
	const [newClientPublic, setNewClientPublic] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [revokeTarget, setRevokeTarget] = useState<AuthorizedApplication | null>(null);
	const [oneTimeSecret, setOneTimeSecret] = useState<OAuthClientSummary | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [secretCopied, setSecretCopied] = useState(false);
	const [createClientSheetOpen, setCreateClientSheetOpen] = useState(false);
	const [createClientStep, setCreateClientStep] = useState<CreateClientStep>("details");
	const [oauthProxySheetOpen, setOAuthProxySheetOpen] = useState(false);
	const [oidcSheetOpen, setOIDCSheetOpen] = useState(false);
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const applicationsQuery = useInfiniteQuery({
		queryKey: queryKeys.applications(),
		queryFn: ({ pageParam }) => fetchApplicationsPage(pageParam as string | null),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.page?.nextCursor ?? undefined,
		enabled: Boolean(session?.user),
	});
	const clientsQuery = useInfiniteQuery({
		queryKey: queryKeys.managedOAuthClients(),
		queryFn: ({ pageParam }) => fetchOAuthClientsPage(pageParam as string | null),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.page?.nextCursor ?? undefined,
		enabled: Boolean(session?.user),
	});
	const oauthProxyQuery = useQuery({
		queryKey: queryKeys.oauthProxy(),
		queryFn: fetchOAuthProxyStatus,
		enabled: Boolean(session?.user),
	});
	const oidcConfigQuery = useQuery({
		queryKey: queryKeys.oidcConfiguration(),
		queryFn: fetchOIDCConfiguration,
		enabled: oidcSheetOpen,
	});
	const applications = applicationsQuery.data?.pages.flatMap((page) => page.applications) ?? [];
	const clients = clientsQuery.data?.pages.flatMap((page) => page.clients) ?? [];
	const loaded = applicationsQuery.isFetched;
	const adminAvailable = clientsQuery.data?.pages.some((page) => page.adminAvailable) ?? false;
	const oauthProxyLoaded = oauthProxyQuery.isFetched;
	const oauthProxy = oauthProxyQuery.data ?? null;
	const oidcConfig = oidcConfigQuery.data ?? null;
	const oidcError =
		oidcConfigQuery.error instanceof Error ? oidcConfigQuery.error.message : null;
	const applicationNextCursor = applicationsQuery.hasNextPage
		? applicationsQuery.data?.pages.at(-1)?.page?.nextCursor ?? null
		: null;
	const clientNextCursor = clientsQuery.hasNextPage
		? clientsQuery.data?.pages.at(-1)?.page?.nextCursor ?? null
		: null;
	const queryStatus =
		status ??
		(applicationsQuery.error instanceof Error
			? { tone: "error" as const, message: applicationsQuery.error.message }
			: clientsQuery.error instanceof Error
				? { tone: "error" as const, message: clientsQuery.error.message }
				: null);
	const applicationsRefreshing =
		applicationsQuery.isFetching && !applicationsQuery.isFetchingNextPage;
	const clientsAppending = clientsQuery.isFetchingNextPage;
	const oidcLoading = oidcConfigQuery.isFetching;

	async function loadApplications(options: { append?: boolean } = {}) {
		setStatus(null);
		if (options.append) {
			await applicationsQuery.fetchNextPage();
			return;
		}
		await applicationsQuery.refetch();
	}

	async function loadClients(options: { append?: boolean } = {}) {
		if (options.append) {
			await clientsQuery.fetchNextPage();
			return;
		}
		setClientDrafts({});
		await clientsQuery.refetch();
	}

	async function loadOAuthProxy() {
		setBusy("oauth-proxy");
		await oauthProxyQuery.refetch();
		setBusy(null);
	}

	function openOIDCSheet() {
		setOIDCSheetOpen(true);
	}

	async function copyValue(key: string, value: string) {
		const result = await copyTextToClipboard(value);
		if (!result.ok) {
			setCopiedKey(null);
			setStatus({ tone: "error", message: result.message });
			return;
		}
		setStatus(null);
		setCopiedKey(key);
		setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
	}

	async function revokeApplication() {
		if (!revokeTarget) return;
		setBusy(`revoke:${revokeTarget.consentId}`);
		setStatus(null);
		const response = await fetch(
			`/api/applications/${encodeURIComponent(revokeTarget.consentId)}/revoke`,
			{ method: "POST" },
		);
		setBusy(null);
		setRevokeTarget(null);
		if (!response.ok) {
			const payload = (await response.json()) as { error?: string };
			setStatus({ tone: "error", message: payload.error ?? "Could not revoke application." });
			return;
		}
		setStatus({ tone: "success", message: "Application access revoked." });
		void applicationsQuery.refetch();
	}

	async function createClient(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (createClientStep === "details") {
			setCreateClientStep("policies");
			return;
		}

		setBusy("create-client");
		setStatus(null);
		const response = await fetch("/api/admin/oauth-clients", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: newClient.name,
				redirectUris: newClient.clientType === "m2m" ? [] : lines(newClient.redirectUris),
				postLogoutRedirectUris:
					newClient.clientType === "m2m" ? [] : lines(newClient.postLogoutRedirectUris),
				scopes: scopeList(newClient.scopes),
				grantTypes: grantTypesForClientType(newClient.clientType),
				allowedAudiences:
					newClient.clientType === "m2m" ? lines(newClient.allowedAudiences) : undefined,
				uri: newClient.uri || undefined,
				icon: newClient.icon || undefined,
				tos: newClient.tos || undefined,
				policy: newClient.policy || undefined,
				public: newClient.clientType === "m2m" ? false : newClientPublic,
				skipConsent: newClient.skipConsent,
				enableEndSession: newClient.enableEndSession,
				backchannelLogoutUri: newClient.backchannelLogoutUri.trim() || undefined,
			}),
		});
		setBusy(null);
		const payload = (await response.json()) as { client?: OAuthClientSummary; error?: string };
		if (!response.ok || !payload.client) {
			setStatus({ tone: "error", message: payload.error ?? "Could not create OAuth client." });
			return;
		}
		setStatus({ tone: "success", message: "OAuth client created." });
		setCreateClientSheetOpen(false);
		setOneTimeSecret(payload.client.clientSecret ? payload.client : null);
		setNewClient(clientDraft());
		setNewClientPublic(false);
		setCreateClientStep("details");
		setClientDrafts({});
		void clientsQuery.refetch();
	}

	async function updateClient(clientId: string) {
		const client = clients.find((item) => item.clientId === clientId);
		const draft = clientDrafts[clientId] ?? (client ? clientDraft(client) : undefined);
		if (!draft) return;
		setBusy(`update:${clientId}`);
		setStatus(null);
		const response = await fetch(`/api/admin/oauth-clients/${encodeURIComponent(clientId)}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: draft.name,
				redirectUris: draft.clientType === "m2m" ? [] : lines(draft.redirectUris),
				postLogoutRedirectUris:
					draft.clientType === "m2m" ? [] : lines(draft.postLogoutRedirectUris),
				scopes: scopeList(draft.scopes),
				grantTypes: grantTypesForClientType(draft.clientType),
				allowedAudiences:
					draft.clientType === "m2m" ? lines(draft.allowedAudiences) : undefined,
				uri: draft.uri || undefined,
				icon: draft.icon || undefined,
				tos: draft.tos || undefined,
				policy: draft.policy || undefined,
				skipConsent: draft.skipConsent,
				enableEndSession: draft.enableEndSession,
				backchannelLogoutUri: draft.backchannelLogoutUri.trim() || null,
			}),
		});
		setBusy(null);
		const payload = (await response.json()) as { error?: string };
		if (!response.ok) {
			setStatus({ tone: "error", message: payload.error ?? "Could not update OAuth client." });
			return;
		}
		setStatus({ tone: "success", message: "OAuth client updated." });
		setClientDrafts({});
		void clientsQuery.refetch();
	}

	async function rotateSecret(clientId: string) {
		setBusy(`rotate:${clientId}`);
		setStatus(null);
		const response = await fetch(
			`/api/admin/oauth-clients/${encodeURIComponent(clientId)}/rotate-secret`,
			{ method: "POST" },
		);
		setBusy(null);
		const payload = (await response.json()) as { client?: OAuthClientSummary; error?: string };
		if (!response.ok || !payload.client) {
			setStatus({ tone: "error", message: payload.error ?? "Could not rotate client secret." });
			return;
		}
		setStatus({ tone: "success", message: "Client secret rotated." });
		setOneTimeSecret(payload.client.clientSecret ? payload.client : null);
	}

	async function setClientDisabled(clientId: string, disabled: boolean) {
		setBusy(`${disabled ? "disable" : "enable"}:${clientId}`);
		setStatus(null);
		const response = await fetch(
			`/api/admin/oauth-clients/${encodeURIComponent(clientId)}/${disabled ? "disable" : "enable"}`,
			{ method: "POST" },
		);
		setBusy(null);
		const payload = (await response.json()) as { error?: string };
		if (!response.ok) {
			setStatus({ tone: "error", message: payload.error ?? "Could not update client status." });
			return;
		}
		setStatus({
			tone: "success",
			message: disabled ? "OAuth client disabled." : "OAuth client enabled.",
		});
		void clientsQuery.refetch();
	}

	function setDraft(clientId: string, patch: Partial<ClientDraft>) {
		setClientDrafts((current) => ({
			...current,
			[clientId]: {
				...(current[clientId] ?? clientDraft()),
				...patch,
			},
		}));
	}

	function toggleExpanded(clientId: string) {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(clientId)) next.delete(clientId);
			else next.add(clientId);
			return next;
		});
	}

	async function uploadApplicationPicture(
		event: ChangeEvent<HTMLInputElement>,
		onUploaded: (image: string) => void,
		busyKey: string,
	) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setBusy(busyKey);
		setStatus(null);
		try {
			const image = await uploadImageAsset(file, "application-picture");
			onUploaded(image);
			setStatus({ tone: "success", message: "Application picture uploaded." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not upload application picture.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function copySecret(secret: string) {
		const result = await copyTextToClipboard(secret);
		if (!result.ok) {
			setSecretCopied(false);
			setStatus({ tone: "error", message: result.message });
			return;
		}
		setStatus(null);
		setSecretCopied(true);
		setTimeout(() => setSecretCopied(false), 1500);
	}

	const canManageClients = canShowManagedOAuthClients(session?.user, {
		adminAvailable,
	});
	const canViewOAuthProxy = oauthProxyLoaded && Boolean(oauthProxy);
	const sections: Section[] = [
		SECTIONS[0],
		...(canManageClients ? [SECTIONS[1]] : []),
		...(canViewOAuthProxy ? [SECTIONS[2]] : []),
	].filter(Boolean) as Section[];

	return (
		<DashboardShell
			user={session?.user}
			title="Applications"
			description="Apps authorized to use your account, plus the OAuth clients this server manages."
			sections={sections}
		>
			<StatusBanner status={queryStatus} />

			<section id="authorized" className="scroll-mt-32">
				<SettingsCard
					title="Authorized applications"
					description="Apps you've granted access to your account through OAuth consent."
					footer={
						<SettingsCardFooter
							hint={
									loaded
										? `${applications.length} authorized app${applications.length === 1 ? "" : "s"}.`
										: <Skeleton className="h-3 w-36" />
								}
							>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void loadApplications()}
									disabled={applicationsQuery.isFetching}
								>
									{applicationsRefreshing ? (
										<Skeleton className="size-4 rounded-full" />
									) : (
										<RefreshCw className="size-4" />
									)}
									Refresh
								</Button>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<RowSkeletons />
						) : applications.length ? (
							<ul className="divide-y">
								{applications.map((application) => (
									<AuthorizedApplicationRow
										key={application.consentId}
										application={application}
										busy={busy}
										onRevoke={() => setRevokeTarget(application)}
									/>
								))}
							</ul>
						) : (
							<EmptyState
								title="No applications yet"
								body="Apps appear here after you approve an OAuth consent request."
							/>
						)}
					</div>
					{applicationNextCursor ? (
						<div className="mt-3 flex justify-center">
							<Button
								variant="outline"
								size="sm"
								onClick={() => void loadApplications({ append: true })}
									disabled={applicationsQuery.isFetchingNextPage}
								>
									{applicationsQuery.isFetchingNextPage ? (
										<Skeleton className="size-4 rounded-full" />
									) : (
										<ChevronDown className="size-4" />
									)}
								Load more
							</Button>
						</div>
					) : null}
				</SettingsCard>
			</section>

			{canManageClients ? (
				<section id="clients" className="scroll-mt-32 space-y-6">
					<SettingsCard
						title="Managed clients"
						description="OAuth clients owned by this admin account. Expand a client to edit it."
						footer={
							<SettingsCardFooter
								hint={`${clients.length} client${clients.length === 1 ? "" : "s"} configured.`}
							>
								<div className="flex flex-wrap gap-2">
									<Button variant="outline" size="sm" onClick={openOIDCSheet}>
										<Globe className="size-4" />
										OpenID configuration
									</Button>
									<Button
										size="sm"
										onClick={() => {
											setCreateClientStep("details");
											setCreateClientSheetOpen(true);
										}}
									>
										<Plus className="size-4" />
										Register client
									</Button>
								</div>
							</SettingsCardFooter>
						}
					>
						{clients.length ? (
							<div className="divide-y overflow-hidden rounded-lg border">
								{clients.map((client) => {
									const draft = clientDrafts[client.clientId] ?? clientDraft(client);
									const open = expanded.has(client.clientId);
									return (
										<div key={client.clientId}>
											<ManagedOAuthClientRow
												client={client}
												open={open}
												copied={copiedKey === `managed-client-id:${client.clientId}`}
												onToggleExpanded={() => toggleExpanded(client.clientId)}
												onCopyClientID={() =>
													void copyValue(`managed-client-id:${client.clientId}`, client.clientId)
												}
											/>

											{open ? (
												<form
													id={`client-${client.clientId}`}
													className="space-y-4 border-t bg-muted/20 px-3.5 py-4"
													onSubmit={(event) => {
														event.preventDefault();
														void updateClient(client.clientId);
													}}
												>
													<div className="grid gap-4 sm:grid-cols-2">
														<Field label="Name">
															<FieldInput
																value={draft.name}
																onChange={(event) =>
																	setDraft(client.clientId, { name: event.target.value })
																}
															/>
														</Field>
														<Field label="Client URI">
															<FieldInput
																value={draft.uri}
																onChange={(event) =>
																	setDraft(client.clientId, { uri: event.target.value })
																}
															/>
														</Field>
													</div>
													<Segmented
														value={draft.clientType}
														onChange={(clientType) => setDraft(client.clientId, { clientType })}
														options={CLIENT_TYPE_OPTIONS}
														aria-label="Client type"
													/>
													<ClientPictureField
														value={draft.icon}
														busy={busy === `upload-picture:${client.clientId}`}
														onURLChange={(icon) => setDraft(client.clientId, { icon })}
														onFileChange={(event) =>
															void uploadApplicationPicture(
																event,
																(icon) => setDraft(client.clientId, { icon }),
																`upload-picture:${client.clientId}`,
															)
														}
													/>
													<Field label="Scopes" hint={SUPPORTED_SCOPE_HINT}>
														<FieldInput
															value={draft.scopes}
															onChange={(event) =>
																setDraft(client.clientId, { scopes: event.target.value })
															}
														/>
													</Field>
													{draft.clientType === "m2m" ? (
														<Field label="Allowed audiences" hint="One protected API resource per line.">
															<FieldTextarea
																value={draft.allowedAudiences}
																onChange={(event) =>
																	setDraft(client.clientId, {
																		allowedAudiences: event.target.value,
																	})
																}
															/>
														</Field>
													) : (
														<div className="grid gap-4 sm:grid-cols-2">
															<Field label="Redirect URIs" hint="One per line.">
																<FieldTextarea
																	value={draft.redirectUris}
																	onChange={(event) =>
																		setDraft(client.clientId, { redirectUris: event.target.value })
																	}
																/>
															</Field>
															<Field label="Post-logout URIs" hint="One per line.">
																<FieldTextarea
																	value={draft.postLogoutRedirectUris}
																	onChange={(event) =>
																		setDraft(client.clientId, {
																			postLogoutRedirectUris: event.target.value,
																		})
																	}
																/>
															</Field>
														</div>
													)}
													<div className="grid gap-4 sm:grid-cols-2">
														<Field label="Terms of service URL">
															<FieldInput
																type="url"
																value={draft.tos}
																onChange={(event) =>
																	setDraft(client.clientId, { tos: event.target.value })
																}
																placeholder="https://app.example.com/terms"
															/>
														</Field>
														<Field label="Privacy policy URL">
															<FieldInput
																type="url"
																value={draft.policy}
																onChange={(event) =>
																	setDraft(client.clientId, { policy: event.target.value })
																}
																placeholder="https://app.example.com/privacy"
															/>
														</Field>
														<Field
															label="Back-channel logout URL"
															hint="Passport POSTs a signed logout_token here when the user is force-logged-out."
														>
															<FieldInput
																type="url"
																value={draft.backchannelLogoutUri}
																onChange={(event) =>
																	setDraft(client.clientId, { backchannelLogoutUri: event.target.value })
																}
																placeholder="https://app.example.com/oidc/backchannel-logout"
															/>
														</Field>
													</div>
													<div className="flex flex-wrap items-end justify-between gap-3 pt-1">
														<div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
															<CheckboxField
																label="Skip consent"
																checked={draft.skipConsent}
																onCheckedChange={(value) =>
																	setDraft(client.clientId, { skipConsent: value })
																}
															/>
															<CheckboxField
																label="OIDC logout"
																checked={draft.enableEndSession}
																onCheckedChange={(value) =>
																	setDraft(client.clientId, { enableEndSession: value })
																}
															/>
														</div>
														<div className="flex flex-wrap gap-2">
															<Button
																size="sm"
																type="submit"
																disabled={busy === `update:${client.clientId}`}
															>
																<Save className="size-4" />
																Save
															</Button>
															{client.public ? null : (
																<Button
																	variant="outline"
																	size="sm"
																	type="button"
																	onClick={() => rotateSecret(client.clientId)}
																	disabled={busy === `rotate:${client.clientId}`}
																>
																	<RotateCcw className="size-4" />
																	Rotate secret
																</Button>
															)}
															<Button
																variant={client.disabled ? "outline" : "destructive"}
																size="sm"
																type="button"
																onClick={() => setClientDisabled(client.clientId, !client.disabled)}
																disabled={
																	busy ===
																	`${client.disabled ? "enable" : "disable"}:${client.clientId}`
																}
															>
																{client.disabled ? (
																	<CheckCircle2 className="size-4" />
																) : (
																	<Ban className="size-4" />
																)}
																{client.disabled ? "Enable" : "Disable"}
															</Button>
														</div>
													</div>
												</form>
											) : null}
										</div>
									);
								})}
							</div>
						) : (
							<EmptyState
								title="No managed clients"
								body="Register a client to let an application sign in through Passport."
							/>
						)}
						{clientNextCursor ? (
							<div className="mt-3 flex justify-center">
								<Button
									variant="outline"
									size="sm"
									onClick={() => void loadClients({ append: true })}
										disabled={clientsAppending}
									>
										{clientsAppending ? (
											<Skeleton className="size-4 rounded-full" />
										) : (
											<ChevronDown className="size-4" />
										)}
									Load more
								</Button>
							</div>
						) : null}
					</SettingsCard>

					<Sheet
						open={createClientSheetOpen}
						onOpenChange={(open) => {
							setCreateClientSheetOpen(open);
							if (open) setCreateClientStep("details");
						}}
					>
						<SheetContent pushed={oidcSheetOpen}>
							<form onSubmit={createClient} className="flex min-h-0 flex-1 flex-col">
								<SheetHeader>
									<SheetTitle>Register OAuth client</SheetTitle>
									<SheetDescription>
										{createClientStep === "details"
											? "Step 1 of 2: application details, redirects, and access behavior."
											: "Step 2 of 2: terms of service and privacy policy URLs."}
									</SheetDescription>
								</SheetHeader>
								<SheetBody className="space-y-4">
									<button
										type="button"
										onClick={openOIDCSheet}
										className="flex w-full items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3 text-left transition-colors hover:bg-muted/60"
									>
										<Globe className="size-[1.15rem] shrink-0 text-muted-foreground" />
										<span className="min-w-0 flex-1">
											<span className="block text-sm font-medium">OpenID configuration</span>
											<span className="block text-xs text-muted-foreground">
												Copy the issuer and endpoint URLs to wire up this client.
											</span>
										</span>
										<ArrowRight className="size-4 shrink-0 text-muted-foreground" />
									</button>
									{createClientStep === "details" ? (
										<>
											<div className="grid gap-4 sm:grid-cols-2">
												<Field label="Name">
													<FieldInput
														value={newClient.name}
														onChange={(event) =>
															setNewClient((current) => ({
																...current,
																name: event.target.value,
															}))
														}
														placeholder="Example Client"
														required
													/>
												</Field>
												<Field label="Client URI">
													<FieldInput
														type="url"
														value={newClient.uri}
														onChange={(event) =>
															setNewClient((current) => ({
																...current,
																uri: event.target.value,
															}))
														}
														placeholder="https://app.example.com"
													/>
												</Field>
											</div>
											<Segmented
												value={newClient.clientType}
												onChange={(clientType) =>
													setNewClient((current) => ({ ...current, clientType }))
												}
												options={CLIENT_TYPE_OPTIONS}
												aria-label="Client type"
											/>
											<ClientPictureField
												value={newClient.icon}
												busy={busy === "upload-picture:new-client"}
												onURLChange={(icon) =>
													setNewClient((current) => ({ ...current, icon }))
												}
												onFileChange={(event) =>
													void uploadApplicationPicture(
														event,
														(icon) => setNewClient((current) => ({ ...current, icon })),
														"upload-picture:new-client",
													)
												}
											/>
											<Field label="Scopes" hint={SUPPORTED_SCOPE_HINT}>
												<FieldInput
													value={newClient.scopes}
													onChange={(event) =>
														setNewClient((current) => ({
															...current,
															scopes: event.target.value,
														}))
													}
													placeholder={DEFAULT_CLIENT_SCOPE_STRING}
												/>
											</Field>
											{newClient.clientType === "m2m" ? (
												<Field label="Allowed audiences" hint="One protected API resource per line.">
													<FieldTextarea
														value={newClient.allowedAudiences}
														onChange={(event) =>
															setNewClient((current) => ({
																...current,
																allowedAudiences: event.target.value,
															}))
														}
														placeholder="https://api.example.com"
														required
													/>
												</Field>
											) : (
												<div className="grid gap-4 sm:grid-cols-2">
													<Field label="Redirect URIs" hint="One per line.">
														<FieldTextarea
															value={newClient.redirectUris}
															onChange={(event) =>
																setNewClient((current) => ({
																	...current,
																	redirectUris: event.target.value,
																}))
															}
															placeholder="https://app.example.com/callback"
															required
														/>
													</Field>
													<Field label="Post-logout URIs" hint="One per line.">
														<FieldTextarea
															value={newClient.postLogoutRedirectUris}
															onChange={(event) =>
																setNewClient((current) => ({
																	...current,
																	postLogoutRedirectUris: event.target.value,
																}))
															}
															placeholder="https://app.example.com/"
														/>
													</Field>
												</div>
											)}
											<div className="flex flex-col gap-3 pt-1">
												{newClient.clientType === "m2m" ? null : (
													<CheckboxField
														label="Public client"
														hint="No secret (SPA / native)."
														checked={newClientPublic}
														onCheckedChange={setNewClientPublic}
													/>
												)}
												<CheckboxField
													label="Skip consent"
													checked={newClient.skipConsent}
													onCheckedChange={(value) =>
														setNewClient((current) => ({ ...current, skipConsent: value }))
													}
												/>
												<CheckboxField
													label="Enable OIDC logout"
													checked={newClient.enableEndSession}
													onCheckedChange={(value) =>
														setNewClient((current) => ({
															...current,
															enableEndSession: value,
														}))
													}
												/>
											</div>
										</>
									) : (
										<>
											<Field label="Terms of service URL">
												<FieldInput
													type="url"
													value={newClient.tos}
													onChange={(event) =>
														setNewClient((current) => ({ ...current, tos: event.target.value }))
													}
													placeholder="https://app.example.com/terms"
												/>
											</Field>
											<Field label="Privacy policy URL">
												<FieldInput
													type="url"
													value={newClient.policy}
													onChange={(event) =>
														setNewClient((current) => ({
															...current,
															policy: event.target.value,
														}))
													}
													placeholder="https://app.example.com/privacy"
												/>
											</Field>
											<Field
												label="Back-channel logout URL"
												hint="Passport POSTs a signed logout_token here when the user is force-logged-out."
											>
												<FieldInput
													type="url"
													value={newClient.backchannelLogoutUri}
													onChange={(event) =>
														setNewClient((current) => ({ ...current, backchannelLogoutUri: event.target.value }))
													}
													placeholder="https://app.example.com/oidc/backchannel-logout"
												/>
											</Field>
										</>
									)}
								</SheetBody>
								<SheetFooter>
									<SheetClose asChild>
										<Button variant="outline" type="button">
											Cancel
										</Button>
									</SheetClose>
									{createClientStep === "policies" ? (
										<Button
											variant="outline"
											type="button"
											onClick={() => setCreateClientStep("details")}
										>
											Back
										</Button>
									) : null}
									<Button type="submit" disabled={busy === "create-client"}>
										{createClientStep === "details" ? null : <Plus className="size-4" />}
										{createClientStep === "details" ? "Continue" : "Create client"}
									</Button>
								</SheetFooter>
							</form>
						</SheetContent>
					</Sheet>
				</section>
			) : null}

			{oauthProxy ? (
				<section id="oauth-proxy" className="scroll-mt-32">
					<SettingsCard
						title="OAuth Proxy"
						description="Preview and local OAuth requests can route through the production callback URL when all environments share the proxy secret."
						footer={
							<SettingsCardFooter
								hint={
									oauthProxy.proxyActive
										? "This environment is proxying through production."
										: "Proxy is inactive when current and production URLs match."
								}
							>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setOAuthProxySheetOpen(true)}
								>
									<Network className="size-4" />
									View details
								</Button>
							</SettingsCardFooter>
						}
					>
						<SummaryRow
							icon={
									<Network
										className={cn(
											"size-[1.15rem]",
											oauthProxy.proxyActive && "text-success",
										)}
									/>
							}
							title={
								<span className="flex items-center gap-2">
									<StatusDot tone={oauthProxy.proxyActive ? "active" : "idle"} />
									{oauthProxy.proxyActive
										? "Routing through production"
										: "Direct — proxy inactive"}
								</span>
							}
							subtitle={
								oauthProxy.proxyActive
									? "OAuth callbacks for this environment are relayed via the production URL."
									: "The current and production URLs match, so requests are handled directly."
							}
						/>
					</SettingsCard>

					<Sheet open={oauthProxySheetOpen} onOpenChange={setOAuthProxySheetOpen}>
						<SheetContent>
							<SheetHeader>
								<SheetTitle>OAuth Proxy</SheetTitle>
								<SheetDescription>
									How OAuth callbacks for this environment route through the production URL.
								</SheetDescription>
							</SheetHeader>
							<SheetBody className="space-y-5">
									<div
										className={cn(
											"flex items-center gap-3 rounded-lg border px-3.5 py-3",
											oauthProxy.proxyActive
												? "border-success/30 bg-success/5"
												: "bg-muted/30",
										)}
								>
									<StatusDot
										tone={oauthProxy.proxyActive ? "active" : "idle"}
										className="size-3"
									/>
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium">
											{oauthProxy.proxyActive
												? "Routing through production"
												: "Direct — proxy inactive"}
										</div>
										<p className="text-xs text-muted-foreground">
											{oauthProxy.proxyActive
												? "OAuth callbacks for this environment are relayed via the production URL."
												: "The current and production URLs match, so requests are handled directly."}
										</p>
									</div>
								</div>

								{/* Routing flow: this environment → production callback. */}
								<div className="flex flex-col items-stretch gap-2 rounded-lg border bg-muted/20 p-3">
									<ProxyNode label="This environment" value={oauthProxy.currentURL} />
									<ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground" />
									<ProxyNode
										label="Production callback"
										value={`${oauthProxy.productionURL}${oauthProxy.callbackPath.replace(":provider", "{provider}")}`}
									/>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<ProxyCheck
										label="Proxy configured"
										ok={oauthProxy.configured}
										okText="Configured"
										badText="Not configured"
									/>
									<ProxyCheck
										label="Shared secret"
										ok={oauthProxy.sharedSecretConfigured}
										okText="Set"
										badText="Missing"
									/>
								</div>

								<div>
									<div className="mb-2 text-xs font-medium text-muted-foreground">
										Trusted origins
									</div>
									{oauthProxy.trustedOrigins.length ? (
										<div className="flex flex-wrap gap-1.5">
											{oauthProxy.trustedOrigins.map((origin) => (
												<ScopeChip key={origin}>{origin}</ScopeChip>
											))}
										</div>
									) : (
										<p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
											No trusted origins configured.
										</p>
									)}
								</div>

								<Button
									variant="outline"
									size="sm"
										onClick={loadOAuthProxy}
										disabled={busy === "oauth-proxy"}
									>
										{busy === "oauth-proxy" ? (
											<Skeleton className="size-4 rounded-full" />
										) : (
											<RefreshCw className="size-4" />
										)}
										Refresh
									</Button>
							</SheetBody>
						</SheetContent>
					</Sheet>
				</section>
			) : null}

			<Sheet open={oidcSheetOpen} onOpenChange={setOIDCSheetOpen}>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>OpenID configuration</SheetTitle>
						<SheetDescription>
							Discovery metadata for this provider. Paste these into the client application's
							OAuth/OIDC settings.
						</SheetDescription>
					</SheetHeader>
					<SheetBody className="space-y-3">
						<CopyRow
							label="Discovery URL"
							value={oidcDiscoveryURL(oidcConfig)}
							copied={copiedKey === "discovery"}
							onCopy={() => copyValue("discovery", oidcDiscoveryURL(oidcConfig))}
						/>
						{oidcLoading && !oidcConfig ? (
							<div className="space-y-3">
								{[0, 1, 2, 3].map((index) => (
									<div key={index} className="space-y-1.5">
										<Skeleton className="h-3 w-32" />
										<Skeleton className="h-9 w-full rounded-lg" />
									</div>
								))}
							</div>
						) : oidcError ? (
							<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm">
								<p className="font-medium text-destructive">Could not load configuration</p>
								<p className="mt-0.5 text-muted-foreground">{oidcError}</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-3"
									onClick={() => void oidcConfigQuery.refetch()}
								>
									<RefreshCw className="size-4" />
									Retry
								</Button>
							</div>
						) : oidcConfig ? (
							<>
								{OIDC_ENDPOINT_ROWS.map(({ key, label }) => {
									const value = oidcConfig[key];
									if (typeof value !== "string" || !value) return null;
									return (
										<CopyRow
											key={key}
											label={label}
											value={value}
											copied={copiedKey === key}
											onCopy={() => copyValue(key, value)}
										/>
									);
								})}
								{oidcConfig.scopes_supported?.length ? (
									<div className="grid gap-1.5">
										<div className="text-xs font-medium text-muted-foreground">
											Supported scopes
										</div>
										<div className="flex flex-wrap gap-1">
											{oidcConfig.scopes_supported.map((scope) => (
												<ScopeChip key={scope}>{scope}</ScopeChip>
											))}
										</div>
									</div>
								) : null}
							</>
						) : null}
					</SheetBody>
					<SheetFooter>
						<SheetClose asChild>
							<Button variant="outline" type="button">
								Close
							</Button>
						</SheetClose>
						<Button
							type="button"
							disabled={!oidcConfig}
							onClick={() =>
								oidcConfig &&
								copyValue("all-json", JSON.stringify(oidcConfig, null, 2))
							}
						>
							{copiedKey === "all-json" ? (
								<Check className="size-4" />
							) : (
								<FileJson className="size-4" />
							)}
							{copiedKey === "all-json" ? "Copied JSON" : "Copy all (JSON)"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke application access?</DialogTitle>
						<DialogDescription>
							This removes the OAuth consent for {revokeTarget?.name ?? "this application"}. It can
							request access again on your next sign-in.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button variant="destructive" onClick={revokeApplication}>
							Revoke access
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(oneTimeSecret)}
				onOpenChange={(open) => {
					if (!open) {
						setOneTimeSecret(null);
						setSecretCopied(false);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Save this client secret</DialogTitle>
						<DialogDescription>
							The secret for {oneTimeSecret?.name} is shown once. Store it in the client
							application's secret manager — you won't be able to see it again.
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">
							{oneTimeSecret?.clientSecret}
						</code>
						<Button
							variant="outline"
							size="icon"
							aria-label="Copy client secret"
							onClick={() =>
								oneTimeSecret?.clientSecret && copySecret(oneTimeSecret.clientSecret)
							}
						>
							{secretCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
						</Button>
					</div>
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}

export function AuthorizedApplicationRow({
	application,
	busy,
	onRevoke,
}: {
	application: AuthorizedApplication;
	busy: string | null;
	onRevoke: () => void;
}) {
	return (
		<li className="flex items-start gap-3 px-3.5 py-3">
			<AppIcon src={application.icon} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{application.name}</div>
				<div className="truncate text-xs tabular-nums text-muted-foreground">
					<span className="font-mono">{application.clientId}</span> · Authorized{" "}
					{formatDate(application.updatedAt ?? application.authorizedAt)}
				</div>
				{application.scopes.length ? (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{application.scopes.map((scope) => (
							<ScopeChip key={scope}>{scope}</ScopeChip>
						))}
					</div>
				) : null}
			</div>
			<Button
				variant="ghost"
				size="sm"
				className="shrink-0 text-muted-foreground hover:text-destructive"
				onClick={onRevoke}
				disabled={busy === `revoke:${application.consentId}`}
			>
				Revoke
			</Button>
		</li>
	);
}

export function ManagedOAuthClientRow({
	client,
	open,
	copied,
	onToggleExpanded,
	onCopyClientID,
}: {
	client: OAuthClientSummary;
	open: boolean;
	copied: boolean;
	onToggleExpanded: () => void;
	onCopyClientID: () => void;
}) {
	return (
		<div className="flex items-center transition-colors hover:bg-muted/40">
			<button
				type="button"
				onClick={onToggleExpanded}
				aria-expanded={open}
				aria-controls={`client-${client.clientId}`}
				className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left"
			>
				<AppIcon src={client.icon} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate text-sm font-medium">{client.name}</span>
						<Badge variant={client.public ? "secondary" : "default"}>
							{client.public ? "Public" : "Confidential"}
						</Badge>
						{clientTypeFromGrantTypes(client.grantTypes) === "m2m" ? (
							<Badge variant="secondary">M2M</Badge>
						) : null}
						{client.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
					</div>
					<div className="truncate font-mono text-xs text-muted-foreground">
						{client.clientId}
					</div>
				</div>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="mr-3 shrink-0 text-muted-foreground"
				aria-label="Copy client ID"
				title="Copy client ID"
				onClick={onCopyClientID}
			>
				{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
			</Button>
		</div>
	);
}

function ClientPictureField({
	value,
	busy,
	onURLChange,
	onFileChange,
}: {
	value: string;
	busy: boolean;
	onURLChange: (value: string) => void;
	onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border bg-background p-3">
			<AppIcon src={value} />
			<div className="min-w-0 flex-1 space-y-3">
				<Field label="Application picture URL" hint="Upload an image or paste an image URL.">
					<FieldInput
						type="url"
						value={value}
						onChange={(event) => onURLChange(event.target.value)}
						placeholder="https://app.example.com/icon.png"
					/>
				</Field>
				<Field label="Upload picture" hint="PNG, JPG, GIF, or WebP up to 2 MB.">
					<FieldInput
						type="file"
						accept="image/png,image/jpeg,image/gif,image/webp"
						disabled={busy}
						onChange={onFileChange}
					/>
					</Field>
					{busy ? (
						<Skeleton className="h-3 w-24" />
					) : null}
				</div>
		</div>
	);
}

function AppIcon({ src }: { src?: string | null }) {
	if (src) {
		return (
			<img
				src={src}
				alt=""
				className="size-9 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
			/>
		);
	}
	return (
		<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
			<AppWindow className="size-[1.1rem]" />
		</div>
	);
}

function ScopeChip({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
			{children}
		</span>
	);
}

function CopyRow({
	label,
	value,
	copied,
	onCopy,
}: {
	label: string;
	value: string;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="text-xs font-medium text-muted-foreground">{label}</div>
			<div className="flex min-w-0 items-center gap-2">
				<code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
					{value}
				</code>
				<Button
					variant="outline"
					size="icon"
					className="shrink-0"
					aria-label={`Copy ${label}`}
					onClick={onCopy}
				>
					{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
				</Button>
			</div>
		</div>
	);
}

function ProxyNode({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2">
			<div className="text-[0.6875rem] font-medium text-muted-foreground uppercase tracking-wide">
				{label}
			</div>
			<code className="mt-0.5 block truncate font-mono text-xs">{value}</code>
		</div>
	);
}

function ProxyCheck({
	label,
	ok,
	okText,
	badText,
}: {
	label: string;
	ok: boolean;
	okText: string;
	badText: string;
}) {
	const tone: DotTone = ok ? "active" : "warn";
	return (
		<div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span className="inline-flex items-center gap-1.5 text-sm font-medium">
				<StatusDot tone={tone} />
				{ok ? okText : badText}
			</span>
		</div>
	);
}

function RowSkeletons() {
	return (
		<ul className="divide-y">
			{[0, 1].map((index) => (
				<li key={index} className="flex items-center gap-3 px-3.5 py-3">
					<Skeleton className="size-9 shrink-0 rounded-lg" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-3.5 w-40" />
						<Skeleton className="h-3 w-56" />
					</div>
				</li>
			))}
		</ul>
	);
}

function EmptyState({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
			<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
				<AppWindow className="size-5" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">{title}</p>
				<p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
			</div>
		</div>
	);
}
