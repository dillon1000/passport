import { useEffect, useState } from "react";
import { LogOut, Monitor, RefreshCw, ShieldX, Smartphone, Tablet } from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
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
import { isCurrentSession, parseUserAgent, relativeTime, type DeviceType } from "@/lib/sessions";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [
	{ id: "active", label: "Active" },
	{ id: "revoke", label: "Sign out" },
];

const DEVICE_ICON: Record<DeviceType, typeof Monitor> = {
	desktop: Monitor,
	mobile: Smartphone,
	tablet: Tablet,
};

type ListedSession = {
	id: string;
	token: string;
	expiresAt: string | Date;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
	ipAddress?: string | null;
	userAgent?: string | null;
};

type ConfirmAction = "revoke-other" | "revoke-all" | null;

export function Sessions() {
	const { data: session } = useRequireSession();
	const [sessions, setSessions] = useState<ListedSession[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
	const user = session?.user;
	const currentToken = session?.session.token;

	async function loadSessions() {
		setStatus(null);
		setBusy(true);
		const result = await authClient.listSessions();
		setBusy(false);
		setLoaded(true);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not load sessions." });
			return;
		}
		setSessions((result.data ?? []) as ListedSession[]);
	}

	useEffect(() => {
		if (!user) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void loadSessions();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.id]);

	async function revokeSession(token: string) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.revokeSession({ token });
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not revoke session." });
			return;
		}
		setStatus({ tone: "success", message: "Session revoked." });
		void loadSessions();
	}

	async function revokeOtherSessions() {
		setConfirmAction(null);
		setStatus(null);
		setBusy(true);
		const result = await authClient.revokeOtherSessions();
		setBusy(false);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not revoke other sessions.",
			});
			return;
		}
		setStatus({ tone: "success", message: "Signed out of all other devices." });
		void loadSessions();
	}

	async function revokeAllSessions() {
		setConfirmAction(null);
		setStatus(null);
		setBusy(true);
		const result = await authClient.revokeSessions();
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not revoke sessions." });
			return;
		}
		window.location.assign("/sign-in?signedOut=1");
	}

	const ordered = [...sessions].sort((a, b) => {
		const currentDelta =
			Number(isCurrentSession(b, currentToken)) - Number(isCurrentSession(a, currentToken));
		if (currentDelta !== 0) return currentDelta;
		const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
		const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
		return bTime - aTime;
	});
	const otherCount = ordered.filter((item) => !isCurrentSession(item, currentToken)).length;

	return (
		<DashboardShell
			user={user}
			title="Sessions"
			description="Devices and browsers currently signed in to your Passport account."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			<section id="active" className="scroll-mt-32">
				<SettingsCard
					title="Active sessions"
					description="Each device that has signed in. Revoke any you don't recognize."
					footer={
						<SettingsCardFooter
							hint={
								loaded
									? `${ordered.length} active session${ordered.length === 1 ? "" : "s"}.`
									: "Loading sessions…"
							}
						>
							<Button variant="outline" size="sm" onClick={loadSessions} disabled={busy}>
								<RefreshCw className={cn("size-4", busy && "animate-spin")} />
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<SessionSkeletons />
						) : ordered.length ? (
							<ul className="divide-y">
								{ordered.map((item) => (
									<SessionRow
										key={item.id}
										session={item}
										current={isCurrentSession(item, currentToken)}
										busy={busy}
										onRevoke={() => revokeSession(item.token)}
									/>
								))}
							</ul>
						) : (
							<p className="px-4 py-10 text-center text-sm text-muted-foreground">
								No active sessions.
							</p>
						)}
					</div>
				</SettingsCard>
			</section>

			<section id="revoke" className="scroll-mt-32">
				<SettingsCard
					title="Sign out other devices"
					description="End other sessions without changing your password. Use this if a device was lost or you see something unfamiliar above."
					footer={
						<SettingsCardFooter hint="“Everywhere” signs you out of this browser too.">
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									type="button"
									onClick={() => setConfirmAction("revoke-other")}
									disabled={busy || otherCount === 0}
								>
									<ShieldX className="size-4" />
									Other devices
								</Button>
								<Button
									variant="destructive"
									size="sm"
									type="button"
									onClick={() => setConfirmAction("revoke-all")}
									disabled={busy}
								>
									<LogOut className="size-4" />
									Everywhere
								</Button>
							</div>
						</SettingsCardFooter>
					}
				/>
			</section>

			<Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{confirmAction === "revoke-all"
								? "Sign out everywhere?"
								: "Sign out other devices?"}
						</DialogTitle>
						<DialogDescription>
							{confirmAction === "revoke-all"
								? "This ends every session, including this browser, and returns you to sign-in."
								: `This keeps this browser signed in and ends ${otherCount} other session${otherCount === 1 ? "" : "s"}.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button
							variant={confirmAction === "revoke-all" ? "destructive" : "default"}
							onClick={confirmAction === "revoke-all" ? revokeAllSessions : revokeOtherSessions}
							disabled={busy}
						>
							{confirmAction === "revoke-all" ? "Sign out everywhere" : "Sign out others"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}

function SessionRow({
	session,
	current,
	busy,
	onRevoke,
}: {
	session: ListedSession;
	current: boolean;
	busy: boolean;
	onRevoke: () => void;
}) {
	const { label, deviceType } = parseUserAgent(session.userAgent);
	const Icon = DEVICE_ICON[deviceType];
	const meta = [
		session.ipAddress?.trim() || "Unknown IP",
		current ? "Active now" : `Last active ${relativeTime(session.updatedAt ?? session.createdAt)}`,
	];

	return (
		<li className={cn("flex items-center gap-3 px-3.5 py-3", current && "bg-muted/40")}>
			<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
				<Icon className="size-[1.1rem]" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{label}</span>
					{current ? (
						<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium">
							<span className="size-1.5 rounded-full bg-emerald-500" />
							This device
						</span>
					) : null}
				</div>
				<div className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</div>
			</div>
			{current ? null : (
				<Button
					variant="ghost"
					size="sm"
					className="shrink-0 text-muted-foreground hover:text-destructive"
					onClick={onRevoke}
					disabled={busy}
				>
					Revoke
				</Button>
			)}
		</li>
	);
}

function SessionSkeletons() {
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
