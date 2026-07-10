/**
 * Admin user governance page. Inputs are Better Auth admin list responses and
 * compact operator form fields; outputs are audited worker mutations for role
 * and ban state. The page hides obvious self-actions but does not use client UI
 * as an authorization boundary.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Ban, RefreshCw, Search, ShieldCheck, Unlock, UserCog } from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
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
import {
	banExpiresInSeconds,
	canMutateUser,
	checkAdminPromotionTarget,
	normalizedUserSearch,
} from "@/lib/admin-users";
import { queryKeys } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";

const PAGE_SIZE = 25;
const ADMIN_ROLES = ["user", "admin"] as const;

const SECTIONS: Section[] = [
	{ id: "promote", label: "Promote" },
	{ id: "users", label: "Users" },
];

type AdminRole = (typeof ADMIN_ROLES)[number];

type AdminUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: string | Date | null;
};

type AdminUsersPayload = {
	users: AdminUser[];
	total: number;
};

async function fetchAdminUsers(input: {
	offset: number;
	search?: string;
}): Promise<AdminUsersPayload> {
	const result = await authClient.admin.listUsers({
		query: {
			limit: PAGE_SIZE,
			offset: input.offset,
			sortBy: "createdAt",
			sortDirection: "desc",
			...(input.search
				? {
						searchValue: input.search,
						searchField: "email" as const,
						searchOperator: "contains" as const,
					}
				: {}),
		},
	});
	if (result.error) {
		throw new Error(result.error.message ?? "No access to user administration.");
	}
	return (result.data ?? { users: [], total: 0 }) as AdminUsersPayload;
}

async function postAdminUserAction(path: string, body?: Record<string, unknown>) {
	const response = await fetch(path, {
		method: "POST",
		headers: body ? { "content-type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	if (response.ok) return { ok: true, message: "" };
	const payload = (await response.json().catch(() => null)) as { error?: string } | null;
	return {
		ok: false,
		message: payload?.error ?? "Admin user action failed.",
	};
}

function formatDate(value?: string | Date | null) {
	if (!value) return "Never";
	return new Date(value).toLocaleString();
}

export function AdminUsers() {
	const { data: session } = useRequireSession();
	const queryClient = useQueryClient();
	const [offset, setOffset] = useState(0);
	const [searchInput, setSearchInput] = useState("");
	const [activeSearch, setActiveSearch] = useState<string | undefined>();
	const [promoteEmail, setPromoteEmail] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(null);
	const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
	const [banReason, setBanReason] = useState("");
	const [banDays, setBanDays] = useState("");
	const usersInput = { offset, search: activeSearch };
	const usersQuery = useQuery({
		queryKey: queryKeys.adminUsers(usersInput),
		queryFn: () => fetchAdminUsers(usersInput),
		enabled: Boolean(session?.user),
	});
	const users = usersQuery.data?.users ?? [];
	const total = usersQuery.data?.total ?? 0;
	const loaded = usersQuery.isFetched;
	const loadingUsers = usersQuery.isFetching;
	const queryStatus =
		status ??
		(usersQuery.error instanceof Error
			? { tone: "error" as const, message: usersQuery.error.message }
			: null);

	async function loadUsers(nextOffset = offset, nextSearch = activeSearch) {
		setStatus(null);
		const input = { offset: nextOffset, search: nextSearch };
		setOffset(nextOffset);
		setActiveSearch(nextSearch);
		try {
			await queryClient.fetchQuery({
				queryKey: queryKeys.adminUsers(input),
				queryFn: () => fetchAdminUsers(input),
			});
			return true;
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "No access to user administration.",
			});
			return false;
		}
	}

	async function focusUsersByEmail(email: string, nextStatus: Status) {
		setSearchInput(email);
		setActiveSearch(email);
		const refreshed = await loadUsers(0, email);
		setBusy(null);
		if (refreshed) setStatus(nextStatus);
	}

	async function searchUsers(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const search = normalizedUserSearch(searchInput);
		setActiveSearch(search);
		await loadUsers(0, search);
	}

	async function promoteUser(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const email = normalizedUserSearch(promoteEmail);
		if (!email) {
			setStatus({ tone: "error", message: "Enter the user's email address." });
			return;
		}

		setBusy("promote");
		setStatus(null);
		const lookup = await authClient.admin.listUsers({
			query: {
				limit: 1,
				offset: 0,
				filterField: "email",
				filterValue: email,
				filterOperator: "eq",
			},
		});
		if (lookup.error) {
			setBusy(null);
			setStatus({ tone: "error", message: lookup.error.message ?? "Could not find that user." });
			return;
		}

		const payload = (lookup.data ?? { users: [], total: 0 }) as AdminUsersPayload;
		const user = payload.users[0] ?? null;
		const promotion = checkAdminPromotionTarget({
			currentUserId: session?.user.id,
			targetUser: user,
		});
		if (!promotion.ok) {
			setBusy(null);
			if (promotion.reason === "already-admin") {
				await focusUsersByEmail(email, {
					tone: "success",
					message: `${user?.email ?? email} is already an admin.`,
				});
				return;
			}
			if (promotion.reason === "self") {
				setStatus({ tone: "error", message: "Use another admin account to change your own role." });
				return;
			}
			setStatus({ tone: "error", message: `No user found for ${email}.` });
			return;
		}

		const result = await postAdminUserAction(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
			role: "admin",
		});
		if (!result.ok) {
			setBusy(null);
			setStatus({ tone: "error", message: result.message || "Could not promote user." });
			return;
		}

		setPromoteEmail("");
		await focusUsersByEmail(email, { tone: "success", message: `${user.email} is now an admin.` });
	}

	async function updateRole(user: AdminUser, role: AdminRole) {
		if (user.role === role || !canMutateUser({ currentUserId: session?.user.id, targetUserId: user.id })) {
			return;
		}
		setBusy(`role:${user.id}`);
		setStatus(null);
		const result = await postAdminUserAction(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
			role,
		});
		if (!result.ok) {
			setStatus({ tone: "error", message: result.message || "Could not update role." });
			setBusy(null);
			return;
		}
		const refreshed = await loadUsers(offset, activeSearch);
		if (refreshed) setStatus({ tone: "success", message: "User role updated." });
		setBusy(null);
	}

	async function banUser(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!banTarget) return;
		setBusy(`ban:${banTarget.id}`);
		setStatus(null);
		const result = await postAdminUserAction(`/api/admin/users/${encodeURIComponent(banTarget.id)}/ban`, {
			banReason: banReason.trim() || undefined,
			banExpiresIn: banExpiresInSeconds(banDays),
		});
		if (!result.ok) {
			setStatus({ tone: "error", message: result.message || "Could not ban user." });
			setBusy(null);
			return;
		}
		setBanTarget(null);
		setBanReason("");
		setBanDays("");
		const refreshed = await loadUsers(offset, activeSearch);
		if (refreshed) setStatus({ tone: "success", message: "User banned." });
		setBusy(null);
	}

	async function unbanUser(user: AdminUser) {
		setBusy(`unban:${user.id}`);
		setStatus(null);
		const result = await postAdminUserAction(`/api/admin/users/${encodeURIComponent(user.id)}/unban`);
		if (!result.ok) {
			setStatus({ tone: "error", message: result.message || "Could not unban user." });
			setBusy(null);
			return;
		}
		const refreshed = await loadUsers(offset, activeSearch);
		if (refreshed) setStatus({ tone: "success", message: "User unbanned." });
		setBusy(null);
	}

	return (
		<DashboardShell
			user={session?.user}
			title="Users"
			description="Find users, confirm account state, adjust role, and manage bans."
			sections={SECTIONS}
		>
			<StatusBanner status={queryStatus} />

			<section id="promote" className="scroll-mt-32">
				<SettingsCard
					title="Promote admin"
					description="Grant the admin role by exact user email."
					footer={
						<SettingsCardFooter hint="Role changes are written through the audited admin endpoint." />
					}
				>
					<form onSubmit={promoteUser} className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<Field label="User email" className="min-w-0 flex-1">
							<FieldInput
								type="email"
								value={promoteEmail}
								onChange={(event) => setPromoteEmail(event.target.value)}
								placeholder="alice@example.com"
								autoComplete="email"
							/>
						</Field>
						<Button type="submit" disabled={busy === "promote"}>
							<ShieldCheck className="size-4" />
							Promote
						</Button>
					</form>
				</SettingsCard>
			</section>

			<section id="users" className="scroll-mt-32">
				<SettingsCard
					title="User governance"
					description="Better Auth admin APIs enforce access; this page only exposes the operator workflow."
					footer={
						<SettingsCardFooter
							hint={
								loaded ? (
									`${users.length} of ${total} user${total === 1 ? "" : "s"} shown.`
								) : (
									<Skeleton className="h-3 w-24" />
								)
							}
						>
							<Button
								variant="outline"
								size="sm"
								type="button"
								onClick={() => void loadUsers(offset, activeSearch)}
								disabled={loadingUsers}
							>
								{loadingUsers ? <Skeleton className="size-4 rounded-full" /> : <RefreshCw className="size-4" />}
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<form onSubmit={searchUsers} className="mb-4 flex gap-2">
						<Field label="Search by email" className="min-w-0 flex-1">
							<FieldInput
								type="search"
								value={searchInput}
								onChange={(event) => setSearchInput(event.target.value)}
								placeholder="alice@example.com"
							/>
						</Field>
						<Button type="submit" className="mt-6" disabled={loadingUsers}>
							<Search className="size-4" />
							Search
						</Button>
					</form>

					<div className="divide-y overflow-hidden rounded-lg border">
						{!loaded ? (
							<RowSkeletons />
						) : users.length ? (
							users.map((user) => {
								const selfAction = !canMutateUser({
									currentUserId: session?.user.id,
									targetUserId: user.id,
								});
								return (
									<div key={user.id} className="flex flex-col gap-3 px-3.5 py-3 lg:flex-row lg:items-center">
										<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 text-sm font-semibold">
											{user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? "U"}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="truncate text-sm font-medium">{user.name || user.email}</span>
												<Badge variant={user.role === "admin" ? "default" : "secondary"}>
													{user.role ?? "user"}
												</Badge>
												{user.emailVerified ? (
													<Badge variant="outline">Verified</Badge>
												) : (
													<Badge variant="secondary">Unverified</Badge>
												)}
												{user.banned ? <Badge variant="destructive">Banned</Badge> : null}
											</div>
											<dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
												<div className="flex gap-1.5">
													<dt className="text-muted-foreground/70">Email</dt>
													<dd>{user.email}</dd>
												</div>
												<div className="flex gap-1.5">
													<dt className="text-muted-foreground/70">ID</dt>
													<dd className="font-mono">{user.id}</dd>
												</div>
												{user.banned ? (
													<div className="flex gap-1.5">
														<dt className="text-muted-foreground/70">Ban expires</dt>
															<dd className="tabular-nums">{formatDate(user.banExpires)}</dd>
													</div>
												) : null}
											</dl>
											{user.banReason ? (
												<p className="mt-1 text-xs text-muted-foreground">{user.banReason}</p>
											) : null}
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<select
												value={user.role === "admin" ? "admin" : "user"}
												onChange={(event) => void updateRole(user, event.target.value as AdminRole)}
												disabled={selfAction || busy === `role:${user.id}`}
												className="h-7 rounded-lg border border-input bg-background px-2 text-[0.8rem] shadow-xs outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
											>
												{ADMIN_ROLES.map((role) => (
													<option key={role} value={role}>
														{role}
													</option>
												))}
											</select>
											{user.banned ? (
												<Button
													variant="outline"
													size="sm"
													type="button"
													onClick={() => void unbanUser(user)}
													disabled={busy === `unban:${user.id}`}
												>
													<Unlock className="size-3.5" />
													Unban
												</Button>
											) : (
												<Button
													variant="destructive"
													size="sm"
													type="button"
													onClick={() => setBanTarget(user)}
													disabled={selfAction}
												>
													<Ban className="size-3.5" />
													Ban
												</Button>
											)}
										</div>
									</div>
								);
							})
						) : (
							<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
								<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
									<UserCog className="size-5" />
								</div>
								<p className="text-sm font-medium">No users found</p>
							</div>
						)}
					</div>

					<div className="mt-4 flex items-center justify-between gap-3">
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={offset === 0 || loadingUsers}
							onClick={() => void loadUsers(Math.max(0, offset - PAGE_SIZE), activeSearch)}
						>
							Previous
						</Button>
						<span className="text-xs tabular-nums text-muted-foreground">
							{total ? `${offset + 1}-${Math.min(offset + users.length, total)} of ${total}` : "0 users"}
						</span>
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={offset + users.length >= total || loadingUsers}
							onClick={() => void loadUsers(offset + PAGE_SIZE, activeSearch)}
						>
							Next
						</Button>
					</div>
				</SettingsCard>
			</section>

			<Dialog open={Boolean(banTarget)} onOpenChange={(open) => !open && setBanTarget(null)}>
				<DialogContent>
					<form onSubmit={banUser}>
						<DialogHeader>
							<DialogTitle>Ban user?</DialogTitle>
							<DialogDescription>
								{banTarget
									? `Block ${banTarget.email} from signing in until the ban is removed or expires.`
									: "Block this user from signing in."}
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-2">
							<Field label="Reason">
								<FieldTextarea
									value={banReason}
									onChange={(event) => setBanReason(event.target.value)}
									placeholder="Compromised account"
								/>
							</Field>
							<Field label="Expires in days" hint="Leave blank for an indefinite ban.">
								<FieldInput
									inputMode="numeric"
									value={banDays}
									onChange={(event) => setBanDays(event.target.value)}
									placeholder="7"
								/>
							</Field>
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</DialogClose>
							<Button
								variant="destructive"
								type="submit"
								disabled={!banTarget || busy === `ban:${banTarget.id}`}
							>
								<ShieldCheck className="size-4" />
								Ban user
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}

function RowSkeletons() {
	return (
		<>
			{[0, 1, 2].map((index) => (
				<div key={index} className="flex items-center gap-3 px-3.5 py-3">
					<Skeleton className="size-9 shrink-0 rounded-lg" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-3.5 w-44" />
						<Skeleton className="h-3 w-64 max-w-full" />
					</div>
				</div>
			))}
		</>
	);
}
