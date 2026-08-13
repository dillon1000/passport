/**
 * Organizations dashboard page. It manages tenant workspaces, memberships,
 * invitations, teams, and image metadata that Better Auth stores on
 * organizations and team records.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
	Building2,
	Check,
	MailPlus,
	Pencil,
	Plus,
	RefreshCw,
	Send,
	Trash2,
	Upload,
	UserMinus,
	UserPlus,
} from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField, Field, FieldInput } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot } from "@/components/auth/status-dot";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/kumo/primitives/dialog";
import {
	Sheet,
	SheetBody,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/kumo/primitives/sheet";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { Loader } from "@/components/kumo/primitives/loader";
import { uploadImageAsset } from "@/lib/image-upload";
import {
	ORGANIZATION_ROLES,
	canChangeOrganizationRole,
	canOfferMemberForTeam,
	canRemoveOrganizationMember,
	canRemoveTeamMember,
	type OrganizationRole,
} from "@/lib/organization-lifecycle";
import { queryKeys } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Deterministic neutral-tinted avatar background from a string seed. */
function avatarTint(seed: string) {
	const tone = 6 + ([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7);
	return {
		backgroundColor: `color-mix(in oklch, var(--foreground) ${tone}%, var(--muted))`,
		color: "var(--foreground)",
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
	{ id: "members", label: "Members" },
	{ id: "teams", label: "Teams" },
];

type InviteRole = OrganizationRole;

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

type OrganizationTeamMember = {
	id?: string;
	userId: string;
	user?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	};
};

type OrganizationTeam = {
	id: string;
	name: string;
	logo?: string | null;
	createdAt?: string | Date | null;
	members?: OrganizationTeamMember[];
};

type FullOrganization = OrganizationSummary & {
	members?: OrganizationMember[];
	invitations?: OrganizationInvitation[];
	teams?: OrganizationTeam[];
};

type ConfirmAction =
	| { type: "remove-member"; member: OrganizationMember }
	| { type: "cancel-invitation"; invitation: OrganizationInvitation }
	| { type: "remove-team"; team: OrganizationTeam };

async function fetchOrganizations() {
	const result = await authClient.organization.list();
	if (result.error) {
		throw new Error(result.error.message ?? "Could not load organizations.");
	}
	return (result.data ?? []) as OrganizationSummary[];
}

async function fetchFullOrganization(organizationId: string) {
	const result = await authClient.organization.getFullOrganization({
		query: { organizationId },
	});
	if (result.error) {
		throw new Error(result.error.message ?? "Could not load organization details.");
	}
	const organization = (result.data ?? null) as FullOrganization | null;
	if (!organization?.teams?.length) return organization;

	const teamsWithMembers = await Promise.all(
		organization.teams.map(async (team) => {
			const membersResult = await authClient.organization.listTeamMembers({
				query: { teamId: team.id },
			});
			return {
				...team,
				members: membersResult.error ? [] : teamMembersFrom(membersResult.data),
			};
		}),
	);
	return { ...organization, teams: teamsWithMembers };
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTeamMember(value: unknown): value is OrganizationTeamMember {
	return isRecord(value) && typeof value.userId === "string";
}

function teamMembersFrom(value: unknown): OrganizationTeamMember[] {
	if (Array.isArray(value)) return value.filter(isTeamMember);
	if (isRecord(value) && Array.isArray(value.members)) {
		return value.members.filter(isTeamMember);
	}
	return [];
}

function memberDisplay(member: OrganizationMember | OrganizationTeamMember) {
	return member.user?.name || member.user?.email || member.userId;
}

export function Organizations() {
	const { data: session } = useRequireSession();
	const queryClient = useQueryClient();
	const [activeOrganizationId, setActiveOrganizationId] = useState<string | undefined>();
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [newName, setNewName] = useState("");
	const [newSlug, setNewSlug] = useState("");
	const [newLogo, setNewLogo] = useState("");
	const [keepCurrentActiveOrganization, setKeepCurrentActiveOrganization] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<InviteRole>("member");
	const [inviteTeamId, setInviteTeamId] = useState("");
	const [teamName, setTeamName] = useState("");
	const [newTeamLogo, setNewTeamLogo] = useState("");
	const [teamMemberDrafts, setTeamMemberDrafts] = useState<Record<string, string>>({});
	const [createOrgSheetOpen, setCreateOrgSheetOpen] = useState(false);
	const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
	const [teamSheetOpen, setTeamSheetOpen] = useState(false);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
	const [teamEditOpen, setTeamEditOpen] = useState(false);
	const [teamEditTarget, setTeamEditTarget] = useState<OrganizationTeam | null>(null);
	const [teamEditName, setTeamEditName] = useState("");
	const organizationsQuery = useQuery({
		queryKey: queryKeys.organizations(session?.user?.id),
		queryFn: fetchOrganizations,
		enabled: Boolean(session?.user),
	});
	const organizations = organizationsQuery.data ?? [];
	const selectedOrganizationId = activeOrganizationId ?? organizations[0]?.id;
	const activeOrganizationQuery = useQuery({
		queryKey: queryKeys.organizationDetails(selectedOrganizationId),
		queryFn: () => {
			if (!selectedOrganizationId) throw new Error("No organization selected.");
			return fetchFullOrganization(selectedOrganizationId);
		},
		enabled: Boolean(selectedOrganizationId),
	});
	const activeOrganization = activeOrganizationQuery.data ?? null;
	const loaded = organizationsQuery.isFetched;
	const loadingOrganizations = organizationsQuery.isFetching;
	const queryStatus =
		status ??
		(organizationsQuery.error instanceof Error
			? { tone: "error" as const, message: organizationsQuery.error.message }
			: activeOrganizationQuery.error instanceof Error
				? { tone: "error" as const, message: activeOrganizationQuery.error.message }
				: null);

	async function loadOrganizations() {
		setStatus(null);
		await organizationsQuery.refetch();
	}

	async function loadFullOrganization(organizationId?: string) {
		const targetOrganizationId = organizationId ?? selectedOrganizationId;
		if (!targetOrganizationId) return;
		setActiveOrganizationId(targetOrganizationId);
		try {
			await queryClient.fetchQuery({
				queryKey: queryKeys.organizationDetails(targetOrganizationId),
				queryFn: () => fetchFullOrganization(targetOrganizationId),
			});
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not load organization details.",
			});
		}
	}

	async function createOrganization(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const name = newName.trim();
		const slug = (newSlug.trim() || slugify(name)).trim();
		setBusy("create-organization");
		setStatus(null);
		const result = await authClient.organization.create({
			name,
			slug,
			logo: newLogo || undefined,
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
		setCreateOrgSheetOpen(false);
		setNewName("");
		setNewSlug("");
		setNewLogo("");
	await loadOrganizations();
	const organization = result.data as OrganizationSummary | null;
	if (organization?.id) {
		setActiveOrganizationId(organization.id);
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
		setActiveOrganizationId(organization.id);
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
			teamId: inviteTeamId || undefined,
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
		setInviteSheetOpen(false);
		setInviteEmail("");
		setInviteTeamId("");
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
			logo: newTeamLogo || undefined,
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
		setTeamSheetOpen(false);
		setTeamName("");
		setNewTeamLogo("");
		await loadFullOrganization(activeOrganization.id);
	}

	async function updateMemberRole(member: OrganizationMember, role: OrganizationRole) {
		if (!activeOrganization || member.role === role || !canChangeOrganizationRole(role)) return;
		setBusy(`member-role:${member.id}`);
		setStatus(null);
		const result = await authClient.organization.updateMemberRole({
			memberId: member.id,
			role,
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not update member role." });
			return;
		}
		setStatus({ tone: "success", message: "Member role updated." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function removeMember(member: OrganizationMember) {
		if (!activeOrganization) return;
		setBusy(`remove-member:${member.id}`);
		setStatus(null);
		const result = await authClient.organization.removeMember({
			memberIdOrEmail: member.id,
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not remove member." });
			return;
		}
		setConfirmAction(null);
		setStatus({ tone: "success", message: "Member removed." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function cancelInvitation(invitation: OrganizationInvitation) {
		if (!activeOrganization) return;
		setBusy(`cancel-invitation:${invitation.id}`);
		setStatus(null);
		const result = await authClient.organization.cancelInvitation({
			invitationId: invitation.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not cancel invitation." });
			return;
		}
		setConfirmAction(null);
		setStatus({ tone: "success", message: "Invitation canceled." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function resendInvitation(invitation: OrganizationInvitation) {
		if (!activeOrganization || !canChangeOrganizationRole(invitation.role)) return;
		setBusy(`resend-invitation:${invitation.id}`);
		setStatus(null);
		const result = await authClient.organization.inviteMember({
			email: invitation.email,
			role: invitation.role,
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not resend invitation." });
			return;
		}
		setStatus({ tone: "success", message: "Invitation resent." });
		await loadFullOrganization(activeOrganization.id);
	}

	function editTeam(team: OrganizationTeam) {
		setTeamEditTarget(team);
		setTeamEditName(team.name);
		setTeamEditOpen(true);
	}

	async function renameTeam(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!activeOrganization || !teamEditTarget) return;
		const name = teamEditName.trim();
		if (!name) return;
		setBusy(`rename-team:${teamEditTarget.id}`);
		setStatus(null);
		const result = await authClient.organization.updateTeam({
			teamId: teamEditTarget.id,
			data: { name },
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not rename team." });
			return;
		}
		setTeamEditOpen(false);
		setTeamEditTarget(null);
		setTeamEditName("");
		setStatus({ tone: "success", message: "Team renamed." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function removeTeam(team: OrganizationTeam) {
		if (!activeOrganization) return;
		setBusy(`remove-team:${team.id}`);
		setStatus(null);
		const result = await authClient.organization.removeTeam({
			teamId: team.id,
			organizationId: activeOrganization.id,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not remove team." });
			return;
		}
		setConfirmAction(null);
		setStatus({ tone: "success", message: "Team removed." });
		await loadFullOrganization(activeOrganization.id);
	}

	function updateTeamMemberDraft(teamId: string, userId: string) {
		setTeamMemberDrafts((drafts) => ({
			...drafts,
			[teamId]: userId,
		}));
	}

	async function addTeamMember(team: OrganizationTeam) {
		if (!activeOrganization) return;
		const userId = teamMemberDrafts[team.id];
		if (!userId) return;
		setBusy(`add-team-member:${team.id}`);
		setStatus(null);
		const result = await authClient.organization.addTeamMember({
			teamId: team.id,
			userId,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not add team member." });
			return;
		}
		setTeamMemberDrafts((drafts) => ({
			...drafts,
			[team.id]: "",
		}));
		setStatus({ tone: "success", message: "Team member added." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function removeTeamMember(team: OrganizationTeam, member: OrganizationTeamMember) {
		if (!activeOrganization) return;
		setBusy(`remove-team-member:${team.id}:${member.userId}`);
		setStatus(null);
		const result = await authClient.organization.removeTeamMember({
			teamId: team.id,
			userId: member.userId,
		});
		setBusy(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not remove team member." });
			return;
		}
		setStatus({ tone: "success", message: "Team member removed." });
		await loadFullOrganization(activeOrganization.id);
	}

	async function confirmLifecycleAction() {
		if (!confirmAction) return;
		if (confirmAction.type === "remove-member") {
			await removeMember(confirmAction.member);
			return;
		}
		if (confirmAction.type === "cancel-invitation") {
			await cancelInvitation(confirmAction.invitation);
			return;
		}
		await removeTeam(confirmAction.team);
	}

	async function uploadDraftLogo(
		event: ChangeEvent<HTMLInputElement>,
		purpose: "organization-logo" | "team-logo",
		onUploaded: (logo: string) => void,
		busyKey: string,
	) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setBusy(busyKey);
		setStatus(null);
		try {
			const logo = await uploadImageAsset(file, purpose);
			onUploaded(logo);
			setStatus({ tone: "success", message: "Logo uploaded." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not upload logo.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function updateOrganizationLogo(event: ChangeEvent<HTMLInputElement>) {
		if (!activeOrganization) return;
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setBusy("organization-logo");
		setStatus(null);
		try {
			const logo = await uploadImageAsset(file, "organization-logo");
			const result = await authClient.organization.update({
				organizationId: activeOrganization.id,
				data: { logo },
			});
			if (result.error) {
				setStatus({
					tone: "error",
					message: result.error.message ?? "Could not save organization logo.",
				});
				return;
			}
			setStatus({ tone: "success", message: "Organization logo updated." });
			await loadOrganizations();
			await loadFullOrganization(activeOrganization.id);
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not upload organization logo.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function updateTeamLogo(event: ChangeEvent<HTMLInputElement>, teamId: string) {
		if (!activeOrganization) return;
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setBusy(`team-logo:${teamId}`);
		setStatus(null);
		try {
			const logo = await uploadImageAsset(file, "team-logo");
			const result = await authClient.organization.updateTeam({
				teamId,
				data: { logo },
			});
			if (result.error) {
				setStatus({
					tone: "error",
					message: result.error.message ?? "Could not save team logo.",
				});
				return;
			}
			setStatus({ tone: "success", message: "Team logo updated." });
			await loadFullOrganization(activeOrganization.id);
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not upload team logo.",
			});
		} finally {
			setBusy(null);
		}
	}

	const activeMembers = activeOrganization?.members ?? [];
	const ownerCount = activeMembers.filter((member) => member.role === "owner").length;
	const pendingInvitations = (activeOrganization?.invitations ?? []).filter(
		(invitation) => invitation.status === "pending",
	);
	const teams = activeOrganization?.teams ?? [];
	const availableMembersForTeam = (team: OrganizationTeam) => {
		const teamMemberUserIds = (team.members ?? []).map((member) => member.userId);
		return activeMembers.filter((member) =>
			canOfferMemberForTeam({
				memberUserId: member.userId,
				teamMemberUserIds,
			}),
		);
	};

	return (
		<DashboardShell
			user={session?.user}
			title="Organizations"
		description="Create tenant workspaces, choose the active organization, invite members, and provision teams."
		sections={SECTIONS}
	>
		<StatusBanner status={queryStatus} />

			<section id="organizations" className="scroll-mt-32">
				<SettingsCard
					title="Your organizations"
					description="Organizations scope members, invitations, roles, teams, and future tenant-aware policies."
					footer={
						<SettingsCardFooter
							hint={
								loaded ? (
									`${organizations.length} organization${organizations.length === 1 ? "" : "s"} available.`
								) : (
									<Skeleton className="h-3 w-36" />
								)
							}
						>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									type="button"
									onClick={loadOrganizations}
									disabled={loadingOrganizations}
								>
									{loadingOrganizations ? (
										<Loader size="sm" />
									) : (
										<RefreshCw className="size-4" />
									)}
									Refresh
								</Button>
								<Button
									size="sm"
									type="button"
									onClick={() => setCreateOrgSheetOpen(true)}
								>
									<Plus className="size-4" />
									Create
								</Button>
							</div>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<RowSkeletons />
						) : organizations.length ? (
							<ul className="divide-y">
								{organizations.map((organization) => {
									const active = selectedOrganizationId === organization.id;
									return (
										<li
											key={organization.id}
											className={cn(
												"flex items-center gap-3 px-3.5 py-3 transition-colors",
												active && "bg-muted/30",
											)}
										>
											<LogoMark name={organization.name} logo={organization.logo} size="lg" />
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
												<div className="truncate text-xs tabular-nums text-muted-foreground">
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
					{activeOrganization ? (
						<div className="mt-4 flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
							<LogoMark
								name={activeOrganization.name}
								logo={activeOrganization.logo}
								size="lg"
							/>
							<div className="min-w-0 flex-1 space-y-3">
								<div>
									<div className="truncate text-sm font-medium">{activeOrganization.name}</div>
									<div className="text-xs text-muted-foreground">Active organization logo</div>
								</div>
								<Field label="Upload organization logo" hint="PNG, JPG, GIF, or WebP up to 2 MB.">
									<FieldInput
										type="file"
										accept="image/png,image/jpeg,image/gif,image/webp"
										disabled={busy === "organization-logo"}
										onChange={(event) => void updateOrganizationLogo(event)}
									/>
								</Field>
							</div>
						</div>
					) : null}
				</SettingsCard>
			</section>

			<Sheet open={createOrgSheetOpen} onOpenChange={setCreateOrgSheetOpen}>
				<SheetContent>
					<form onSubmit={createOrganization} className="flex min-h-0 flex-1 flex-col">
						<SheetHeader>
							<SheetTitle>Create organization</SheetTitle>
							<SheetDescription>
								Provision a new organization and automatically make yourself the owner. Slugs are
								stable identifiers for organization URLs and API calls.
							</SheetDescription>
						</SheetHeader>
						<SheetBody className="space-y-4">
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
							<div className="flex items-start gap-3 rounded-xl border bg-background p-3">
								<LogoMark name={newName || "Organization"} logo={newLogo} size="lg" />
								<div className="min-w-0 flex-1 space-y-3">
									<Field label="Logo URL" hint="Upload a logo or paste an image URL.">
										<FieldInput
											value={newLogo}
											onChange={(event) => setNewLogo(event.target.value)}
											placeholder="/api/profile-images/..."
										/>
									</Field>
									<Field label="Upload logo" hint="PNG, JPG, GIF, or WebP up to 2 MB.">
										<FieldInput
											type="file"
											accept="image/png,image/jpeg,image/gif,image/webp"
											disabled={busy === "new-organization-logo"}
											onChange={(event) =>
												void uploadDraftLogo(
													event,
													"organization-logo",
													setNewLogo,
													"new-organization-logo",
												)
											}
										/>
									</Field>
								</div>
							</div>
							<CheckboxField
								label="Keep current active organization"
								hint="Create this organization without switching the active session context."
								checked={keepCurrentActiveOrganization}
								onCheckedChange={setKeepCurrentActiveOrganization}
							/>
						</SheetBody>
						<SheetFooter>
							<SheetClose asChild>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</SheetClose>
							<Button type="submit" disabled={busy === "create-organization"}>
								<Plus className="size-4" />
								Create
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

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
						>
							<Button
								size="sm"
								type="button"
								onClick={() => setInviteSheetOpen(true)}
								disabled={!activeOrganization}
							>
								<MailPlus className="size-4" />
								Invite member
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="grid gap-4 md:grid-cols-2">
						<ListBlock title={`Members (${activeMembers.length})`} empty="No members loaded.">
							{activeMembers.map((member) => {
								const display = member.user?.name || member.user?.email || member.userId;
								const canRemove = canRemoveOrganizationMember({
									currentUserId: session?.user.id,
									memberUserId: member.userId,
									memberRole: member.role,
									ownerCount,
								});
								return (
									<li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
										<span
											className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[0.6875rem] font-semibold"
											style={avatarTint(display)}
										>
											{member.user?.image ? (
												<img
													src={member.user.image}
													alt=""
													className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
												/>
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
										<div className="flex shrink-0 items-center gap-2">
											<select
												value={canChangeOrganizationRole(member.role) ? member.role : "member"}
												onChange={(event) =>
													void updateMemberRole(member, event.target.value as OrganizationRole)
												}
												disabled={busy === `member-role:${member.id}`}
												className="h-7 rounded-lg border border-input bg-background px-2 text-[0.8rem] capitalize shadow-xs outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
											>
												{ORGANIZATION_ROLES.map((role) => (
													<option key={role} value={role} className="capitalize">
														{role}
													</option>
												))}
											</select>
											<Button
												variant="ghost"
												size="icon-sm"
												type="button"
												aria-label={`Remove ${display}`}
												title={canRemove ? "Remove member" : "Cannot remove this member"}
												disabled={!canRemove}
												onClick={() => setConfirmAction({ type: "remove-member", member })}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
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
										<div className="truncate text-xs tabular-nums text-muted-foreground">
											Expires {formatDate(invitation.expiresAt)}
										</div>
									</div>
									<RoleBadge role={invitation.role} />
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="outline"
											size="sm"
											type="button"
											onClick={() => void resendInvitation(invitation)}
											disabled={busy === `resend-invitation:${invitation.id}`}
										>
											<Send className="size-3.5" />
											Resend
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											type="button"
											aria-label={`Cancel invitation for ${invitation.email}`}
											onClick={() => setConfirmAction({ type: "cancel-invitation", invitation })}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								</li>
							))}
						</ListBlock>
					</div>
				</SettingsCard>

				<Sheet open={inviteSheetOpen} onOpenChange={setInviteSheetOpen}>
					<SheetContent>
						<form onSubmit={inviteMember} className="flex min-h-0 flex-1 flex-col">
							<SheetHeader>
								<SheetTitle>Invite member</SheetTitle>
								<SheetDescription>
									{activeOrganization
										? `Send an invitation to join ${activeOrganization.name}.`
										: "Send an invitation to join the active organization."}
								</SheetDescription>
							</SheetHeader>
							<SheetBody className="space-y-4">
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
										{ORGANIZATION_ROLES.map((role) => (
											<option key={role} value={role} className="capitalize">
												{role}
											</option>
										))}
									</select>
								</Field>
								{teams.length ? (
									<Field label="Team" hint="Optional. Accepted members join this team.">
										<select
											value={inviteTeamId}
											onChange={(event) => setInviteTeamId(event.target.value)}
											disabled={!activeOrganization}
											className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:bg-input/30"
										>
											<option value="">No team</option>
											{teams.map((team) => (
												<option key={team.id} value={team.id}>
													{team.name}
												</option>
											))}
										</select>
									</Field>
								) : null}
							</SheetBody>
							<SheetFooter>
								<SheetClose asChild>
									<Button variant="outline" type="button">
										Cancel
									</Button>
								</SheetClose>
								<Button
									type="submit"
									disabled={!activeOrganization || busy === "invite-member"}
								>
									<MailPlus className="size-4" />
									Invite
								</Button>
							</SheetFooter>
						</form>
					</SheetContent>
				</Sheet>
			</section>

			<section id="teams" className="scroll-mt-32">
				<SettingsCard
					title="Teams"
					description="Create team containers inside the active organization."
					footer={
						<SettingsCardFooter
							hint={`${teams.length} team${teams.length === 1 ? "" : "s"} in this organization.`}
						>
							<Button
								size="sm"
								type="button"
								onClick={() => setTeamSheetOpen(true)}
								disabled={!activeOrganization}
							>
								<Plus className="size-4" />
								Create team
							</Button>
						</SettingsCardFooter>
					}
				>
						<ListBlock title="Provisioned teams" empty="No teams created yet.">
							{teams.map((team) => {
								const teamMembers = team.members ?? [];
								const teamMemberUserIds = teamMembers.map((member) => member.userId);
								const availableMembers = availableMembersForTeam(team);
								return (
									<li key={team.id} className="space-y-3 px-3 py-3">
										<div className="flex flex-wrap items-center gap-3">
											<LogoMark name={team.name} logo={team.logo} size="sm" />
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium">{team.name}</div>
												<div className="truncate text-xs tabular-nums text-muted-foreground">
													{teamMembers.length} member{teamMembers.length === 1 ? "" : "s"} · Created{" "}
													{formatDate(team.createdAt)}
												</div>
											</div>
											<label
												className={cn(
													"inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium shadow-xs transition-colors hover:bg-muted",
													busy === `team-logo:${team.id}` &&
														"pointer-events-none cursor-not-allowed opacity-50",
												)}
											>
												<Upload className="size-3.5" />
												Logo
												<input
													type="file"
													accept="image/png,image/jpeg,image/gif,image/webp"
													className="sr-only"
													disabled={busy === `team-logo:${team.id}`}
													onChange={(event) => void updateTeamLogo(event, team.id)}
												/>
											</label>
											<Button
												variant="outline"
												size="sm"
												type="button"
												onClick={() => editTeam(team)}
											>
												<Pencil className="size-3.5" />
												Rename
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												type="button"
												aria-label={`Remove ${team.name}`}
												onClick={() => setConfirmAction({ type: "remove-team", team })}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>

										<div className="rounded-lg border bg-muted/20">
											{teamMembers.length ? (
												<ul className="divide-y">
													{teamMembers.map((member) => {
														const display = memberDisplay(member);
														const canRemove = canRemoveTeamMember({
															memberUserId: member.userId,
															teamMemberUserIds,
														});
														return (
															<li key={member.userId} className="flex items-center gap-2 px-3 py-2">
																<span
																	className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full text-[0.625rem] font-semibold"
																	style={avatarTint(display)}
																>
																	{member.user?.image ? (
																		<img
																			src={member.user.image}
																			alt=""
																			className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
																		/>
																	) : (
																		initials(display)
																	)}
																</span>
																<span className="min-w-0 flex-1 truncate text-sm">{display}</span>
																<Button
																	variant="ghost"
																	size="icon-sm"
																	type="button"
																	aria-label={`Remove ${display} from ${team.name}`}
																	disabled={!canRemove || busy === `remove-team-member:${team.id}:${member.userId}`}
																	onClick={() => void removeTeamMember(team, member)}
																>
																	<UserMinus className="size-3.5" />
																</Button>
															</li>
														);
													})}
												</ul>
											) : (
												<p className="px-3 py-2 text-sm text-muted-foreground">No members assigned.</p>
											)}
										</div>

										<div className="flex flex-col gap-2 sm:flex-row">
											<select
												value={teamMemberDrafts[team.id] ?? ""}
												onChange={(event) => updateTeamMemberDraft(team.id, event.target.value)}
												disabled={!availableMembers.length || busy === `add-team-member:${team.id}`}
												className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:bg-input/30"
											>
												<option value="">
													{availableMembers.length ? "Select organization member" : "No members to add"}
												</option>
												{availableMembers.map((member) => (
													<option key={member.id} value={member.userId}>
														{memberDisplay(member)}
													</option>
												))}
											</select>
											<Button
												variant="outline"
												type="button"
												onClick={() => void addTeamMember(team)}
												disabled={!teamMemberDrafts[team.id] || busy === `add-team-member:${team.id}`}
											>
												<UserPlus className="size-4" />
												Add member
											</Button>
										</div>
									</li>
								);
							})}
						</ListBlock>
				</SettingsCard>

				<Sheet open={teamSheetOpen} onOpenChange={setTeamSheetOpen}>
					<SheetContent>
						<form onSubmit={createTeam} className="flex min-h-0 flex-1 flex-col">
							<SheetHeader>
								<SheetTitle>Create team</SheetTitle>
								<SheetDescription>
									{activeOrganization
										? `Create a team container inside ${activeOrganization.name}.`
										: "Create a team container inside the active organization."}
								</SheetDescription>
							</SheetHeader>
							<SheetBody className="space-y-4">
								<Field label="Team name">
									<FieldInput
										value={teamName}
										onChange={(event) => setTeamName(event.target.value)}
										placeholder="Engineering"
										disabled={!activeOrganization}
										required
									/>
								</Field>
								<div className="flex items-start gap-3 rounded-xl border bg-background p-3">
									<LogoMark name={teamName || "Team"} logo={newTeamLogo} size="sm" />
									<div className="min-w-0 flex-1 space-y-3">
										<Field label="Logo URL" hint="Upload a logo or paste an image URL.">
											<FieldInput
												value={newTeamLogo}
												onChange={(event) => setNewTeamLogo(event.target.value)}
												placeholder="/api/profile-images/..."
												disabled={!activeOrganization}
											/>
										</Field>
										<Field label="Upload logo" hint="PNG, JPG, GIF, or WebP up to 2 MB.">
											<FieldInput
												type="file"
												accept="image/png,image/jpeg,image/gif,image/webp"
												disabled={!activeOrganization || busy === "new-team-logo"}
												onChange={(event) =>
													void uploadDraftLogo(event, "team-logo", setNewTeamLogo, "new-team-logo")
												}
											/>
										</Field>
									</div>
								</div>
							</SheetBody>
							<SheetFooter>
								<SheetClose asChild>
									<Button variant="outline" type="button">
										Cancel
									</Button>
								</SheetClose>
								<Button
									type="submit"
									disabled={!activeOrganization || busy === "create-team"}
								>
									<Plus className="size-4" />
									Create team
								</Button>
							</SheetFooter>
						</form>
					</SheetContent>
				</Sheet>

				<Sheet open={teamEditOpen} onOpenChange={setTeamEditOpen}>
					<SheetContent>
						<form onSubmit={renameTeam} className="flex min-h-0 flex-1 flex-col">
							<SheetHeader>
								<SheetTitle>Rename team</SheetTitle>
								<SheetDescription>
									{teamEditTarget
										? `Update the team name for ${teamEditTarget.name}.`
										: "Update this team name."}
								</SheetDescription>
							</SheetHeader>
							<SheetBody className="space-y-4">
								<Field label="Team name">
									<FieldInput
										value={teamEditName}
										onChange={(event) => setTeamEditName(event.target.value)}
										placeholder="Engineering"
										required
									/>
								</Field>
							</SheetBody>
							<SheetFooter>
								<SheetClose asChild>
									<Button variant="outline" type="button">
										Cancel
									</Button>
								</SheetClose>
								<Button
									type="submit"
									disabled={!teamEditTarget || busy === `rename-team:${teamEditTarget.id}`}
								>
									<Pencil className="size-4" />
									Rename
								</Button>
							</SheetFooter>
						</form>
					</SheetContent>
				</Sheet>
			</section>

			<Dialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{confirmTitle(confirmAction)}</DialogTitle>
						<DialogDescription>{confirmDescription(confirmAction)}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" type="button">
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							type="button"
							onClick={() => void confirmLifecycleAction()}
							disabled={!confirmAction || busy?.startsWith(confirmAction.type)}
						>
							<Trash2 className="size-4" />
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}

function confirmTitle(action: ConfirmAction | null) {
	if (!action) return "Confirm action";
	if (action.type === "remove-member") return "Remove member?";
	if (action.type === "cancel-invitation") return "Cancel invitation?";
	return "Remove team?";
}

function confirmDescription(action: ConfirmAction | null) {
	if (!action) return "Confirm this organization action.";
	if (action.type === "remove-member") {
		const display = action.member.user?.email ?? action.member.userId;
		return `Remove ${display} from this organization.`;
	}
	if (action.type === "cancel-invitation") {
		return `Cancel the pending invitation for ${action.invitation.email}.`;
	}
	return `Remove ${action.team.name} from this organization.`;
}

function LogoMark({
	name,
	logo,
	size,
}: {
	name: string;
	logo?: string | null;
	size: "sm" | "lg";
}) {
	return (
		<span
			className={cn(
				"grid shrink-0 place-items-center overflow-hidden rounded-md text-xs font-semibold",
				size === "lg" ? "size-9" : "size-7",
			)}
			style={logo ? undefined : avatarTint(name)}
		>
			{logo ? (
				<img
					src={logo}
					alt=""
					className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
				/>
			) : (
				initials(name)
			)}
		</span>
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
