import { useEffect, useState, type FormEvent } from "react";
import { Building2, Check, MailPlus, Plus, RefreshCw } from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField, Field, FieldInput } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot } from "@/components/auth/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Deterministic neutral-tinted avatar background from a string seed. */
function avatarTint(seed: string) {
	const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
	return {
		backgroundColor: `oklch(0.92 0.04 ${hue})`,
		color: `oklch(0.38 0.08 ${hue})`,
	};
}

function initials(value: string) {
	return (
		value
			.split(/[\s@.]+/)
			.filter(Boolean)
			.map((part) => part[0])
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

const ROLE_TONE: Record<string, "default" | "secondary" | "outline"> = {
	owner: "default",
	admin: "secondary",
	member: "outline",
};

function RoleBadge({ role }: { role: string }) {
	return (
		<Badge variant={ROLE_TONE[role] ?? "outline"} className="capitalize">
			{role}
		</Badge>
	);
}

const SECTIONS: Section[] = [
	{ id: "organizations", label: "Organizations" },
	{ id: "create", label: "Create" },
	{ id: "members", label: "Members" },
	{ id: "teams", label: "Teams" },
];

const INVITE_ROLES = ["member", "admin", "owner"] as const;

type InviteRole = (typeof INVITE_ROLES)[number];

type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	createdAt?: string | Date | null;
};

type OrganizationMember = {
	id: string;
	role: string;
	userId: string;
	user?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	};
};

type OrganizationInvitation = {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt?: string | Date | null;
};

type OrganizationTeam = {
	id: string;
	name: string;
	createdAt?: string | Date | null;
};

type FullOrganization = OrganizationSummary & {
	members?: OrganizationMember[];
	invitations?: OrganizationInvitation[];
	teams?: OrganizationTeam[];
};

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function formatDate(value?: string | Date | null) {
	if (!value) return "Unknown";
	return new Date(value).toLocaleDateString();
}

export function Organizations() {
	const { data: session } = useRequireSession();
	const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
	const [activeOrganization, setActiveOrganization] = useState<FullOrganization | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [newName, setNewName] = useState("");
	const [newSlug, setNewSlug] = useState("");
	const [keepCurrentActiveOrganization, setKeepCurrentActiveOrganization] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<InviteRole>("member");
	const [teamName, setTeamName] = useState("");

	async function loadOrganizations() {
		setBusy("organizations");
		setStatus(null);
		const result = await authClient.organization.list();
		setBusy(null);
		setLoaded(true);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not load organizations.",
			});
			return;
		}
		const nextOrganizations = (result.data ?? []) as OrganizationSummary[];
		setOrganizations(nextOrganizations);
		if (!activeOrganization && nextOrganizations[0]) {
			await loadFullOrganization(nextOrganizations[0].id);
		}
	}

	async function loadFullOrganization(organizationId?: string) {
		setBusy("active-organization");
		const result = await authClient.organization.getFullOrganization({
			query: organizationId ? { organizationId } : undefined,
		});
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not load organization details.",
			});
			return;
		}
		setActiveOrganization((result.data ?? null) as FullOrganization | null);
	}

	useEffect(() => {
		if (!session?.user) return;
		queueMicrotask(() => {
			void loadOrganizations();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.user?.id]);

	async function createOrganization(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const name = newName.trim();
		const slug = (newSlug.trim() || slugify(name)).trim();
		setBusy("create-organization");
		setStatus(null);
		const result = await authClient.organization.create({
			name,
			slug,
			keepCurrentActiveOrganization,
		});
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not create organization.",
			});
			return;
		}
		setStatus({ tone: "success", message: "Organization created." });
		setNewName("");
		setNewSlug("");
		await loadOrganizations();
		const organization = result.data as OrganizationSummary | null;
		if (organization?.id) {
			await loadFullOrganization(organization.id);
		}
	}

	async function activateOrganization(organization: OrganizationSummary) {
		setBusy(`activate:${organization.id}`);
		setStatus(null);
		const result = await authClient.organization.setActive({
			organizationId: organization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not activate organization.",
			});
			return;
		}
		setStatus({ tone: "success", message: `${organization.name} is active.` });
		await loadFullOrganization(organization.id);
	}

	async function inviteMember(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!activeOrganization) return;
		setBusy("invite-member");
		setStatus(null);
		const result = await authClient.organization.inviteMember({
			email: inviteEmail.trim(),
			role: inviteRole,
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not send invitation.",
			});
			return;
		}
		setStatus({ tone: "success", message: "Invitation sent." });
		setInviteEmail("");
		await loadFullOrganization(activeOrganization.id);
	}

	async function createTeam(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!activeOrganization) return;
		setBusy("create-team");
		setStatus(null);
		const result = await authClient.organization.createTeam({
			name: teamName.trim(),
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not create team.",
			});
			return;
		}
		setStatus({ tone: "success", message: "Team created." });
		setTeamName("");
		await loadFullOrganization(activeOrganization.id);
	}

	const activeMembers = activeOrganization?.members ?? [];
	const pendingInvitations = (activeOrganization?.invitations ?? []).filter(
		(invitation) => invitation.status === "pending",
	);
	const teams = activeOrganization?.teams ?? [];

	return (
		<DashboardShell
			user={session?.user}
			title="Organizations"
			description="Create tenant workspaces, choose the active organization, invite members, and provision teams."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			<section id="organizations" className="scroll-mt-32">
				<SettingsCard
					title="Your organizations"
					description="Organizations scope members, invitations, roles, teams, and future tenant-aware policies."
					footer={
						<SettingsCardFooter
							hint={
								loaded
									? `${organizations.length} organization${organizations.length === 1 ? "" : "s"} available.`
									: "Loading organizations..."
							}
						>
							<Button
								variant="outline"
								size="sm"
								type="button"
								onClick={loadOrganizations}
								disabled={busy === "organizations"}
							>
								<RefreshCw className={cn("size-4", busy === "organizations" && "animate-spin")} />
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<RowSkeletons />
						) : organizations.length ? (
							<ul className="divide-y">
								{organizations.map((organization) => {
									const active = activeOrganization?.id === organization.id;
									return (
										<li
											key={organization.id}
											className={cn(
												"flex items-center gap-3 px-3.5 py-3 transition-colors",
												active && "bg-muted/30",
											)}
										>
											<span
												className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold"
												style={avatarTint(organization.name)}
											>
												{initials(organization.name)}
											</span>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<span className="truncate text-sm font-medium">{organization.name}</span>
													{active ? (
														<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
															<StatusDot tone="active" />
															Active
														</span>
													) : null}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													<span className="font-mono">{organization.slug}</span> · Created{" "}
													{formatDate(organization.createdAt)}
												</div>
											</div>
											<Button
												variant={active ? "secondary" : "outline"}
												size="sm"
												type="button"
												onClick={() => activateOrganization(organization)}
												disabled={active || busy === `activate:${organization.id}`}
											>
												{active ? <Check className="size-4" /> : null}
												{active ? "Active" : "Set active"}
											</Button>
										</li>
									);
								})}
							</ul>
						) : (
							<EmptyState
								title="No organizations yet"
								body="Create one below to provision a tenant workspace."
							/>
						)}
					</div>
				</SettingsCard>
			</section>

			<section id="create" className="scroll-mt-32">
				<form onSubmit={createOrganization}>
					<SettingsCard
						title="Create organization"
						description="Provision a new organization and automatically make yourself the owner."
						footer={
							<SettingsCardFooter hint="Slugs are stable identifiers for organization URLs and API calls.">
								<Button size="sm" type="submit" disabled={busy === "create-organization"}>
									<Plus className="size-4" />
									Create
								</Button>
							</SettingsCardFooter>
						}
					>
						<div className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<Field label="Name">
									<FieldInput
										value={newName}
										onChange={(event) => {
											const name = event.target.value;
											setNewName(name);
											if (!newSlug) setNewSlug(slugify(name));
										}}
										placeholder="Acme"
										required
									/>
								</Field>
								<Field label="Slug">
									<FieldInput
										value={newSlug}
										onChange={(event) => setNewSlug(slugify(event.target.value))}
										placeholder="acme"
										required
									/>
								</Field>
							</div>
							<CheckboxField
								label="Keep current active organization"
								hint="Create this organization without switching the active session context."
								checked={keepCurrentActiveOrganization}
								onCheckedChange={setKeepCurrentActiveOrganization}
							/>
						</div>
					</SettingsCard>
				</form>
			</section>

			<section id="members" className="scroll-mt-32">
				<SettingsCard
					title="Members and invitations"
					description={
						activeOrganization
							? `Manage membership for ${activeOrganization.name}.`
							: "Set an active organization to manage members."
					}
					footer={
						<SettingsCardFooter
							hint={`${activeMembers.length} member${activeMembers.length === 1 ? "" : "s"}, ${pendingInvitations.length} pending invitation${pendingInvitations.length === 1 ? "" : "s"}.`}
						/>
					}
				>
					<div className="space-y-4">
						<form className="grid gap-3 sm:grid-cols-[1fr_140px_auto]" onSubmit={inviteMember}>
							<Field label="Invite email">
								<FieldInput
									type="email"
									value={inviteEmail}
									onChange={(event) => setInviteEmail(event.target.value)}
									placeholder="teammate@example.com"
									disabled={!activeOrganization}
									required
								/>
							</Field>
							<Field label="Role">
								<select
									value={inviteRole}
									onChange={(event) => setInviteRole(event.target.value as InviteRole)}
									disabled={!activeOrganization}
									className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm capitalize shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:bg-input/30"
								>
									{INVITE_ROLES.map((role) => (
										<option key={role} value={role} className="capitalize">
											{role}
										</option>
									))}
								</select>
							</Field>
							<Button
								className="self-end"
								size="sm"
								type="submit"
								disabled={!activeOrganization || busy === "invite-member"}
							>
								<MailPlus className="size-4" />
								Invite
							</Button>
						</form>
						<div className="grid gap-4 md:grid-cols-2">
							<ListBlock title={`Members (${activeMembers.length})`} empty="No members loaded.">
								{activeMembers.map((member) => {
									const display = member.user?.name || member.user?.email || member.userId;
									return (
										<li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
											<span
												className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[0.6875rem] font-semibold"
												style={avatarTint(display)}
											>
												{member.user?.image ? (
													<img src={member.user.image} alt="" className="size-full object-cover" />
												) : (
													initials(display)
												)}
											</span>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium">{display}</div>
												{member.user?.email && member.user.email !== display ? (
													<div className="truncate text-xs text-muted-foreground">
														{member.user.email}
													</div>
												) : null}
											</div>
											<RoleBadge role={member.role} />
										</li>
									);
								})}
							</ListBlock>
							<ListBlock
								title={`Pending invitations (${pendingInvitations.length})`}
								empty="No pending invitations."
							>
								{pendingInvitations.map((invitation) => (
									<li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
										<MailPlus className="size-4 shrink-0 text-muted-foreground" />
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">{invitation.email}</div>
											<div className="truncate text-xs text-muted-foreground">
												Expires {formatDate(invitation.expiresAt)}
											</div>
										</div>
										<RoleBadge role={invitation.role} />
									</li>
								))}
							</ListBlock>
						</div>
					</div>
				</SettingsCard>
			</section>

			<section id="teams" className="scroll-mt-32">
				<SettingsCard
					title="Teams"
					description="Create team containers inside the active organization."
					footer={
						<SettingsCardFooter
							hint={`${teams.length} team${teams.length === 1 ? "" : "s"} in this organization.`}
						/>
					}
				>
					<div className="space-y-4">
						<form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={createTeam}>
							<Field label="Team name">
								<FieldInput
									value={teamName}
									onChange={(event) => setTeamName(event.target.value)}
									placeholder="Engineering"
									disabled={!activeOrganization}
									required
								/>
							</Field>
							<Button
								className="self-end"
								size="sm"
								type="submit"
								disabled={!activeOrganization || busy === "create-team"}
							>
								<Plus className="size-4" />
								Create team
							</Button>
						</form>
						<ListBlock title="Provisioned teams" empty="No teams created yet.">
							{teams.map((team) => (
								<li key={team.id} className="flex items-center gap-3 px-3 py-2.5">
									<div className="grid size-7 shrink-0 place-items-center rounded-md border bg-background text-xs font-medium">
										{team.name.slice(0, 2).toUpperCase()}
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium">{team.name}</div>
										<div className="truncate text-xs text-muted-foreground">
											Created {formatDate(team.createdAt)}
										</div>
									</div>
								</li>
							))}
						</ListBlock>
					</div>
				</SettingsCard>
			</section>
		</DashboardShell>
	);
}

function ListBlock({
	title,
	empty,
	children,
}: {
	title: string;
	empty: string;
	children: React.ReactNode;
}) {
	const items = Array.isArray(children) ? children.filter(Boolean) : children;
	return (
		<div className="overflow-hidden rounded-lg border">
			<div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
				{title}
			</div>
			{Array.isArray(items) && items.length === 0 ? (
				<p className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className="divide-y">{items}</ul>
			)}
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
				<Building2 className="size-5" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">{title}</p>
				<p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
			</div>
		</div>
	);
}
