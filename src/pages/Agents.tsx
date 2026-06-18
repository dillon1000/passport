import { useEffect, useState, type ReactNode } from "react";
import { Bot, Copy, KeyRound, RefreshCw, RotateCcw, ServerCog, Trash2 } from "lucide-react";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot, type DotTone } from "@/components/auth/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	canReactivateAgentStatus,
	canRevokeAgentStatus,
	canRevokeGrantStatus,
	reactivateAgent,
	revokeAgent,
	revokeAgentCapability,
	revokeHost,
} from "@/lib/agent-auth";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Map a free-form status string onto a status-dot tone. */
function statusTone(status: string): DotTone {
	const value = status.toLowerCase();
	if (["active", "online", "enabled", "approved", "granted"].includes(value)) return "active";
	if (["pending", "provisioning", "idle"].includes(value)) return "warn";
	if (["revoked", "disabled", "denied", "expired"].includes(value)) return "danger";
	return "idle";
}

/** Status string rendered as a dot + label pill. */
function StatusPill({ status }: { status: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
			<StatusDot tone={statusTone(status)} />
			{status}
		</span>
	);
}

const SECTIONS: Section[] = [
	{ id: "discovery", label: "Discovery" },
	{ id: "capabilities", label: "Capabilities" },
	{ id: "agents", label: "Agents" },
	{ id: "hosts", label: "Hosts" },
];

type AgentConfiguration = {
	issuer?: string;
	provider_name?: string;
	provider_description?: string;
	default_location?: string;
	endpoints?: Record<string, string>;
	modes_supported?: string[];
	approval_methods_supported?: string[];
};

type AgentCapability = {
	name: string;
	description?: string;
	approval_strength?: string;
	location?: string;
	grant_status?: string;
	input_fields?: { name: string; type?: string; description?: string }[];
};

type AgentSummary = {
	agent_id: string;
	name: string;
	status: string;
	mode: string;
	host_id?: string | null;
	host_name?: string | null;
	created_at?: string | Date | null;
	last_used_at?: string | Date | null;
	agent_capability_grants?: { capability: string; status: string }[];
};

type HostSummary = {
	id: string;
	name: string;
	status: string;
	default_capabilities?: string[];
	created_at?: string | Date | null;
	last_used_at?: string | Date | null;
};

function formatDate(value?: string | Date | null) {
	if (!value) return "Never";
	return new Date(value).toLocaleString();
}

async function readJSON<T>(response: Response) {
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(payload?.error ?? `Request failed with ${response.status}.`);
	}
	return (await response.json()) as T;
}

export function Agents() {
	const { data: session } = useRequireSession();
	const [configuration, setConfiguration] = useState<AgentConfiguration | null>(null);
	const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
	const [agents, setAgents] = useState<AgentSummary[]>([]);
	const [hosts, setHosts] = useState<HostSummary[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [copied, setCopied] = useState<string | null>(null);

	async function refreshAgentData() {
		const [configurationPayload, capabilityPayload, agentPayload, hostPayload] =
			await Promise.all([
				fetch("/.well-known/agent-configuration").then(readJSON<AgentConfiguration>),
				fetch("/api/auth/capability/list").then(readJSON<{ capabilities: AgentCapability[] }>),
				fetch("/api/auth/agent/list").then(readJSON<{ agents: AgentSummary[] }>),
				fetch("/api/auth/host/list").then(readJSON<{ hosts: HostSummary[] }>),
			]);
		setConfiguration(configurationPayload);
		setCapabilities(capabilityPayload.capabilities);
		setAgents(agentPayload.agents);
		setHosts(hostPayload.hosts);
		setLoaded(true);
	}

	async function loadAgents() {
		setBusy("load");
		setStatus(null);
		try {
			await refreshAgentData();
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not load Agent Auth data.",
			});
		} finally {
			setBusy(null);
		}
	}

	useEffect(() => {
		if (!session?.user) return;
		queueMicrotask(() => {
			void loadAgents();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.user?.id]);

	async function copyValue(key: string, value: string) {
		await navigator.clipboard.writeText(value);
		setCopied(key);
		setTimeout(() => setCopied(null), 1500);
	}

	async function runTrustAction(
		busyKey: string,
		successMessage: string,
		action: () => Promise<{ error?: { message?: string } | null }>,
	) {
		setBusy(busyKey);
		setStatus(null);
		try {
			const result = await action();
			if (result.error) {
				setStatus({
					tone: "error",
					message: result.error.message ?? "Could not update Agent Auth trust.",
				});
				return;
			}
			await refreshAgentData();
			setStatus({ tone: "success", message: successMessage });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not update Agent Auth trust.",
			});
		} finally {
			setBusy(null);
		}
	}

	const discoveryURL = `${window.location.origin}/.well-known/agent-configuration`;

	return (
		<DashboardShell
			user={session?.user}
			title="Agents"
			description="Review Agent Auth discovery metadata, visible capabilities, registered agents, and enrolled hosts."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			<section id="discovery" className="scroll-mt-32">
				<SettingsCard
					title="Discovery"
					description="Agents start here to discover this provider and its authorization endpoints."
					footer={
						<SettingsCardFooter
							hint={configuration?.provider_name ?? "Agent Auth provider metadata."}
						>
							<Button variant="outline" size="sm" onClick={loadAgents} disabled={busy === "load"}>
								<RefreshCw className={cn("size-4", busy === "load" && "animate-spin")} />
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="space-y-3">
						<CopyRow
							label="Discovery URL"
							value={discoveryURL}
							copied={copied === "discovery"}
							onCopy={() => copyValue("discovery", discoveryURL)}
						/>
						{configuration?.default_location ? (
							<CopyRow
								label="Default execute URL"
								value={configuration.default_location}
								copied={copied === "execute"}
								onCopy={() => copyValue("execute", configuration.default_location ?? "")}
							/>
						) : null}
						<div className="grid gap-3 sm:grid-cols-2">
							<MetadataBlock title="Modes" values={configuration?.modes_supported} />
							<MetadataBlock
								title="Approval methods"
								values={configuration?.approval_methods_supported}
							/>
						</div>
					</div>
				</SettingsCard>
			</section>

			<section id="capabilities" className="scroll-mt-32">
				<SettingsCard
					title="Capabilities"
					description="Capabilities are the scoped operations agents can request and execute."
					footer={
						<SettingsCardFooter
							hint={`${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"} visible.`}
						/>
					}
				>
					{!loaded ? (
						<RowSkeletons />
					) : capabilities.length ? (
						<div className="divide-y overflow-hidden rounded-lg border">
							{capabilities.map((capability) => (
								<div key={capability.name} className="px-3.5 py-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-sm font-medium">{capability.name}</span>
										{capability.approval_strength ? (
											<Badge variant="secondary">{capability.approval_strength}</Badge>
										) : null}
										{capability.grant_status ? <Badge>{capability.grant_status}</Badge> : null}
									</div>
									{capability.description ? (
										<p className="mt-1 text-sm text-muted-foreground">{capability.description}</p>
									) : null}
									{capability.input_fields?.length ? (
										<div className="mt-2 flex flex-wrap gap-1">
											{capability.input_fields.map((field) => (
												<Chip key={field.name}>{field.name}</Chip>
											))}
										</div>
									) : null}
								</div>
							))}
						</div>
					) : (
						<EmptyState icon={<KeyRound className="size-5" />} title="No capabilities visible" />
					)}
				</SettingsCard>
			</section>

			<section id="agents" className="scroll-mt-32">
				<SettingsCard
					title="Registered agents"
					description="Agents linked to this user through delegated or autonomous Agent Auth flows."
					footer={
						<SettingsCardFooter
							hint={`${agents.length} agent${agents.length === 1 ? "" : "s"} registered.`}
						/>
					}
				>
					{!loaded ? (
						<RowSkeletons />
					) : agents.length ? (
						<div className="divide-y overflow-hidden rounded-lg border">
							{agents.map((agent) => (
								<div
									key={agent.agent_id}
									className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-start"
								>
									<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
										<Bot className="size-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-medium">{agent.name}</span>
											<Badge variant="secondary">{agent.mode}</Badge>
											<StatusPill status={agent.status} />
										</div>
										<dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">ID</dt>
												<dd className="font-mono">{agent.agent_id}</dd>
											</div>
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">Host</dt>
												<dd>{agent.host_name ?? agent.host_id ?? "Unknown"}</dd>
											</div>
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">Last used</dt>
												<dd>{formatDate(agent.last_used_at)}</dd>
											</div>
										</dl>
										{agent.agent_capability_grants?.length ? (
											<div className="mt-2 flex flex-wrap gap-1">
												{agent.agent_capability_grants.map((grant) => {
													const busyKey = `grant:${agent.agent_id}:${grant.capability}`;
													return (
														<span
															key={`${agent.agent_id}:${grant.capability}`}
															className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
														>
															{grant.capability}:{grant.status}
															{canRevokeGrantStatus(grant.status) ? (
																<button
																	type="button"
																	aria-label={`Revoke ${grant.capability}`}
																	disabled={busy === busyKey}
																	onClick={() =>
																		void runTrustAction(
																			busyKey,
																			"Capability grant revoked.",
																			() =>
																				revokeAgentCapability(
																					agent.agent_id,
																					grant.capability,
																				),
																		)
																	}
																	className="rounded text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
																>
																	<Trash2 className="size-3" />
																</button>
															) : null}
														</span>
													);
												})}
											</div>
										) : null}
									</div>
									<div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
										{canReactivateAgentStatus(agent.status) ? (
											<Button
												variant="outline"
												size="sm"
												type="button"
												disabled={busy === `agent-reactivate:${agent.agent_id}`}
												onClick={() =>
													void runTrustAction(
														`agent-reactivate:${agent.agent_id}`,
														"Agent reactivated.",
														() => reactivateAgent(agent.agent_id),
													)
												}
											>
												<RotateCcw className="size-3.5" />
												Reactivate
											</Button>
										) : null}
										{canRevokeAgentStatus(agent.status) ? (
											<Button
												variant="destructive"
												size="sm"
												type="button"
												disabled={busy === `agent-revoke:${agent.agent_id}`}
												onClick={() =>
													void runTrustAction(
														`agent-revoke:${agent.agent_id}`,
														"Agent revoked.",
														() => revokeAgent(agent.agent_id),
													)
												}
											>
												<Trash2 className="size-3.5" />
												Revoke
											</Button>
										) : null}
									</div>
								</div>
							))}
						</div>
					) : (
						<EmptyState icon={<Bot className="size-5" />} title="No agents registered" />
					)}
				</SettingsCard>
			</section>

			<section id="hosts" className="scroll-mt-32">
				<SettingsCard
					title="Hosts"
					description="Agent hosts are devices or runtimes that enroll agents with this provider."
					footer={
						<SettingsCardFooter
							hint={`${hosts.length} host${hosts.length === 1 ? "" : "s"} enrolled.`}
						/>
					}
				>
					{!loaded ? (
						<RowSkeletons />
					) : hosts.length ? (
						<div className="divide-y overflow-hidden rounded-lg border">
							{hosts.map((host) => (
								<div
									key={host.id}
									className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-start"
								>
									<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
										<ServerCog className="size-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-medium">{host.name}</span>
											<StatusPill status={host.status} />
										</div>
										<dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">ID</dt>
												<dd className="font-mono">{host.id}</dd>
											</div>
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">Last used</dt>
												<dd>{formatDate(host.last_used_at)}</dd>
											</div>
										</dl>
										{host.default_capabilities?.length ? (
											<div className="mt-2 flex flex-wrap gap-1">
												{host.default_capabilities.map((capability) => (
													<Chip key={`${host.id}:${capability}`}>{capability}</Chip>
												))}
											</div>
										) : null}
									</div>
									{host.status.toLowerCase() !== "revoked" ? (
										<Button
											variant="destructive"
											size="sm"
											type="button"
											className="shrink-0 sm:ml-auto"
											disabled={busy === `host-revoke:${host.id}`}
											onClick={() =>
												void runTrustAction(
													`host-revoke:${host.id}`,
													"Host revoked.",
													() => revokeHost(host.id),
												)
											}
										>
											<Trash2 className="size-3.5" />
											Revoke
										</Button>
									) : null}
								</div>
							))}
						</div>
					) : (
						<EmptyState icon={<ServerCog className="size-5" />} title="No hosts enrolled" />
					)}
				</SettingsCard>
			</section>
		</DashboardShell>
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
		<div className="grid gap-1.5">
			<div className="text-xs font-medium text-muted-foreground">{label}</div>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
					{value}
				</code>
				<Button variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={onCopy}>
					<Copy className="size-4" />
				</Button>
				<span className="w-12 text-xs text-muted-foreground">{copied ? "Copied" : null}</span>
			</div>
		</div>
	);
}

function MetadataBlock({ title, values }: { title: string; values?: string[] }) {
	return (
		<div className="rounded-lg border px-3 py-2.5">
			<div className="text-xs font-medium text-muted-foreground">{title}</div>
			<div className="mt-2 flex flex-wrap gap-1">
				{values?.length ? values.map((value) => <Chip key={value}>{value}</Chip>) : <Chip>Unknown</Chip>}
			</div>
		</div>
	);
}

function Chip({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
			{children}
		</span>
	);
}

function RowSkeletons() {
	return (
		<ul className="divide-y overflow-hidden rounded-lg border">
			{[0, 1].map((index) => (
				<li key={index} className="flex items-center gap-3 px-3.5 py-3">
					<Skeleton className="size-9 shrink-0 rounded-lg" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-3.5 w-44" />
						<Skeleton className="h-3 w-64 max-w-full" />
					</div>
				</li>
			))}
		</ul>
	);
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-lg border px-4 py-12 text-center">
			<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
				{icon}
			</div>
			<p className="text-sm font-medium">{title}</p>
		</div>
	);
}
