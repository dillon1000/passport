import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
	AppWindow,
	ArrowRight,
	Ban,
	Check,
	CheckCircle2,
	ChevronDown,
	Copy,
	Plus,
	RefreshCw,
	RotateCcw,
	Save,
} from "lucide-react";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField, Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot, type DotTone } from "@/components/auth/status-dot";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [
	{ id: "authorized", label: "Authorized" },
	{ id: "clients", label: "Clients" },
	{ id: "oauth-proxy", label: "OAuth Proxy" },
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
	public?: boolean;
	disabled?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
	clientSecret?: string;
};

type ClientDraft = {
	name: string;
	redirectUris: string;
	postLogoutRedirectUris: string;
	scopes: string;
	uri: string;
	icon: string;
	skipConsent: boolean;
	enableEndSession: boolean;
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

function clientDraft(client?: OAuthClientSummary): ClientDraft {
	return {
		name: client?.name ?? "",
		redirectUris: client?.redirectUris.join("\n") ?? "",
		postLogoutRedirectUris: client?.postLogoutRedirectUris?.join("\n") ?? "",
		scopes: client?.scopes?.join(" ") ?? "openid profile email",
		uri: client?.uri ?? "",
		icon: client?.icon ?? "",
		skipConsent: Boolean(client?.skipConsent),
		enableEndSession: Boolean(client?.enableEndSession),
	};
}

function formatDate(value?: string | null) {
	if (!value) return "Unknown";
	return new Date(value).toLocaleString();
}

export function Applications() {
	const { data: session } = useRequireSession();
	const [applications, setApplications] = useState<AuthorizedApplication[]>([]);
	const [clients, setClients] = useState<OAuthClientSummary[]>([]);
	const [clientDrafts, setClientDrafts] = useState<Record<string, ClientDraft>>({});
	const [newClient, setNewClient] = useState<ClientDraft>(() => clientDraft());
	const [newClientPublic, setNewClientPublic] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [adminLoaded, setAdminLoaded] = useState(false);
	const [adminAvailable, setAdminAvailable] = useState(false);
	const [oauthProxyLoaded, setOAuthProxyLoaded] = useState(false);
	const [oauthProxy, setOAuthProxy] = useState<OAuthProxyStatus | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [revokeTarget, setRevokeTarget] = useState<AuthorizedApplication | null>(null);
	const [oneTimeSecret, setOneTimeSecret] = useState<OAuthClientSummary | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [secretCopied, setSecretCopied] = useState(false);

	async function loadApplications() {
		setStatus(null);
		setBusy("applications");
		const response = await fetch("/api/applications");
		setBusy(null);
		setLoaded(true);
		if (!response.ok) {
			const payload = (await response.json()) as { error?: string };
			setStatus({ tone: "error", message: payload.error ?? "Could not load applications." });
			return;
		}
		const payload = (await response.json()) as { applications: AuthorizedApplication[] };
		setApplications(payload.applications);
	}

	async function loadClients() {
		const response = await fetch("/api/admin/oauth-clients");
		setAdminLoaded(true);
		if (response.status === 403 || response.status === 401) {
			setAdminAvailable(false);
			return;
		}
		if (!response.ok) {
			setAdminAvailable(false);
			return;
		}
		setAdminAvailable(true);
		const payload = (await response.json()) as { clients: OAuthClientSummary[] };
		setClients(payload.clients);
		setClientDrafts(
			Object.fromEntries(payload.clients.map((client) => [client.clientId, clientDraft(client)])),
		);
	}

	async function loadOAuthProxy() {
		setBusy("oauth-proxy");
		const response = await fetch("/api/admin/oauth-proxy");
		setBusy(null);
		setOAuthProxyLoaded(true);
		if (response.status === 403 || response.status === 401) {
			setOAuthProxy(null);
			return;
		}
		if (!response.ok) {
			setOAuthProxy(null);
			return;
		}
		const payload = (await response.json()) as { oauthProxy: OAuthProxyStatus };
		setOAuthProxy(payload.oauthProxy);
	}

	useEffect(() => {
		if (!session?.user) return;
		queueMicrotask(() => {
			void loadApplications();
			void loadClients();
			void loadOAuthProxy();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.user?.id]);

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
		void loadApplications();
	}

	async function createClient(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy("create-client");
		setStatus(null);
		const response = await fetch("/api/admin/oauth-clients", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: newClient.name,
				redirectUris: lines(newClient.redirectUris),
				postLogoutRedirectUris: lines(newClient.postLogoutRedirectUris),
				scopes: scopeList(newClient.scopes),
				uri: newClient.uri || undefined,
				icon: newClient.icon || undefined,
				public: newClientPublic,
				skipConsent: newClient.skipConsent,
				enableEndSession: newClient.enableEndSession,
			}),
		});
		setBusy(null);
		const payload = (await response.json()) as { client?: OAuthClientSummary; error?: string };
		if (!response.ok || !payload.client) {
			setStatus({ tone: "error", message: payload.error ?? "Could not create OAuth client." });
			return;
		}
		setStatus({ tone: "success", message: "OAuth client created." });
		setOneTimeSecret(payload.client.clientSecret ? payload.client : null);
		setNewClient(clientDraft());
		setNewClientPublic(false);
		void loadClients();
	}

	async function updateClient(clientId: string) {
		const draft = clientDrafts[clientId];
		if (!draft) return;
		setBusy(`update:${clientId}`);
		setStatus(null);
		const response = await fetch(`/api/admin/oauth-clients/${encodeURIComponent(clientId)}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: draft.name,
				redirectUris: lines(draft.redirectUris),
				postLogoutRedirectUris: lines(draft.postLogoutRedirectUris),
				scopes: scopeList(draft.scopes),
				uri: draft.uri || undefined,
				icon: draft.icon || undefined,
				skipConsent: draft.skipConsent,
				enableEndSession: draft.enableEndSession,
			}),
		});
		setBusy(null);
		const payload = (await response.json()) as { error?: string };
		if (!response.ok) {
			setStatus({ tone: "error", message: payload.error ?? "Could not update OAuth client." });
			return;
		}
		setStatus({ tone: "success", message: "OAuth client updated." });
		void loadClients();
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
		void loadClients();
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

	async function copySecret(secret: string) {
		await navigator.clipboard.writeText(secret);
		setSecretCopied(true);
		setTimeout(() => setSecretCopied(false), 1500);
	}

	const canManageClients = adminLoaded && adminAvailable;
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
			<StatusBanner status={status} />

			<section id="authorized" className="scroll-mt-32">
				<SettingsCard
					title="Authorized applications"
					description="Apps you've granted access to your account through OAuth consent."
					footer={
						<SettingsCardFooter
							hint={
								loaded
									? `${applications.length} authorized app${applications.length === 1 ? "" : "s"}.`
									: "Loading applications…"
							}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={loadApplications}
								disabled={busy === "applications"}
							>
								<RefreshCw className={cn("size-4", busy === "applications" && "animate-spin")} />
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
									<li
										key={application.consentId}
										className="flex items-start gap-3 px-3.5 py-3"
									>
										<AppIcon src={application.icon} />
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">{application.name}</div>
											<div className="truncate text-xs text-muted-foreground">
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
											onClick={() => setRevokeTarget(application)}
											disabled={busy === `revoke:${application.consentId}`}
										>
											Revoke
										</Button>
									</li>
								))}
							</ul>
						) : (
							<EmptyState
								title="No applications yet"
								body="Apps appear here after you approve an OAuth consent request."
							/>
						)}
					</div>
				</SettingsCard>
			</section>

			{canManageClients ? (
				<section id="clients" className="scroll-mt-32 space-y-6">
					<form onSubmit={createClient}>
						<SettingsCard
							title="Register OAuth client"
							description="Create a public or confidential client for an app that signs in through Passport."
							footer={
								<SettingsCardFooter hint="Confidential client secrets are shown only once.">
									<Button size="sm" type="submit" disabled={busy === "create-client"}>
										<Plus className="size-4" />
										Create client
									</Button>
								</SettingsCardFooter>
							}
						>
							<div className="space-y-4">
								<div className="grid gap-4 sm:grid-cols-2">
									<Field label="Name">
										<FieldInput
											value={newClient.name}
											onChange={(event) =>
												setNewClient((current) => ({ ...current, name: event.target.value }))
											}
											placeholder="Example Client"
											required
										/>
									</Field>
									<Field label="Client URI">
										<FieldInput
											value={newClient.uri}
											onChange={(event) =>
												setNewClient((current) => ({ ...current, uri: event.target.value }))
											}
											placeholder="https://app.example.com"
										/>
									</Field>
								</div>
								<Field label="Scopes" hint="Space or comma separated.">
									<FieldInput
										value={newClient.scopes}
										onChange={(event) =>
											setNewClient((current) => ({ ...current, scopes: event.target.value }))
										}
										placeholder="openid profile email"
									/>
								</Field>
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
								<div className="flex flex-col gap-3 pt-1 sm:flex-row sm:gap-6">
									<CheckboxField
										label="Public client"
										hint="No secret (SPA / native)."
										checked={newClientPublic}
										onCheckedChange={setNewClientPublic}
									/>
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
											setNewClient((current) => ({ ...current, enableEndSession: value }))
										}
									/>
								</div>
							</div>
						</SettingsCard>
					</form>

					<SettingsCard
						title="Managed clients"
						description="OAuth clients owned by this admin account. Expand a client to edit it."
						footer={
							<SettingsCardFooter
								hint={`${clients.length} client${clients.length === 1 ? "" : "s"} configured.`}
							/>
						}
					>
						{clients.length ? (
							<div className="divide-y overflow-hidden rounded-lg border">
								{clients.map((client) => {
									const draft = clientDrafts[client.clientId] ?? clientDraft(client);
									const open = expanded.has(client.clientId);
									return (
										<div key={client.clientId}>
											<button
												type="button"
												onClick={() => toggleExpanded(client.clientId)}
												aria-expanded={open}
												aria-controls={`client-${client.clientId}`}
												className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
											>
												<AppIcon src={client.icon} />
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-2">
														<span className="truncate text-sm font-medium">{client.name}</span>
														<Badge variant={client.public ? "secondary" : "default"}>
															{client.public ? "Public" : "Confidential"}
														</Badge>
														{client.disabled ? (
															<Badge variant="destructive">Disabled</Badge>
														) : null}
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
													<Field label="Scopes" hint="Space or comma separated.">
														<FieldInput
															value={draft.scopes}
															onChange={(event) =>
																setDraft(client.clientId, { scopes: event.target.value })
															}
														/>
													</Field>
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
								body="Register a client above to let an application sign in through Passport."
							/>
						)}
					</SettingsCard>
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
									onClick={loadOAuthProxy}
									disabled={busy === "oauth-proxy"}
								>
									<RefreshCw
										className={cn("size-4", busy === "oauth-proxy" && "animate-spin")}
									/>
									Refresh
								</Button>
							</SettingsCardFooter>
						}
					>
						<div className="space-y-5">
							<div
								className={cn(
									"flex items-center gap-3 rounded-lg border px-3.5 py-3",
									oauthProxy.proxyActive
										? "border-emerald-500/30 bg-emerald-500/5"
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
							<div className="flex flex-col items-stretch gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
								<ProxyNode label="This environment" value={oauthProxy.currentURL} />
								<ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />
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
						</div>
					</SettingsCard>
				</section>
			) : null}

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

function AppIcon({ src }: { src?: string | null }) {
	if (src) {
		return <img src={src} alt="" className="size-9 shrink-0 rounded-lg border object-cover" />;
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
