/**
 * Sessions dashboard page. Inputs are Better Auth session records, same-browser
 * multi-session account records, and request metadata captured by the Worker;
 * rows show active/revocation state and local browser/platform marks from
 * `public/icons` when the user agent is known.
 */
import { useEffect, useState } from "react";
import {
	LogIn,
	LogOut,
	Monitor,
	Plus,
	RefreshCw,
	ShieldX,
	Smartphone,
	Tablet,
	UserRound,
} from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { PublicIcon, type PublicIconSource } from "@/components/auth/public-icon";
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
import { formatRequestLocation, type RequestLocation } from "@/lib/request-location";
import {
	isCurrentSession,
	parseUserAgent,
	relativeTime,
	type DeviceType,
} from "@/lib/sessions";
import { resolveAddAccountURL } from "@/lib/auth-flow";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [
	{ id: "accounts", label: "Accounts" },
	{ id: "active", label: "Active" },
	{ id: "revoke", label: "Sign out" },
];

const DEVICE_ICON: Record<DeviceType, typeof Monitor> = {
	desktop: Monitor,
	mobile: Smartphone,
	tablet: Tablet,
};

type SessionIconAsset = {
	src: PublicIconSource;
	label: string;
};

const BROWSER_ICONS: Record<string, SessionIconAsset> = {
	"Chrome or Chromium based browser": { label: "Chrome", src: "/icons/chrome.svg" },
	Edge: { label: "Edge", src: "/icons/edge.svg" },
	Firefox: { label: "Firefox", src: "/icons/firefox.svg" },
	Opera: { label: "Opera", src: "/icons/opera.svg" },
	Safari: { label: "Safari", src: "/icons/safari.svg" },
};

const PLATFORM_ICONS: Record<string, SessionIconAsset> = {
	Android: { label: "Android", src: "/icons/android.svg" },
	ChromeOS: { label: "ChromeOS", src: "/icons/chrome.svg" },
	iOS: { label: "Apple", src: { light: "/icons/apple_light.svg", dark: "/icons/apple_dark.svg" } },
	iPadOS: { label: "Apple", src: { light: "/icons/apple_light.svg", dark: "/icons/apple_dark.svg" } },
	Linux: { label: "Linux", src: "/icons/linux.svg" },
	macOS: { label: "Apple", src: { light: "/icons/apple_light.svg", dark: "/icons/apple_dark.svg" } },
	Windows: { label: "Windows", src: "/icons/windows.svg" },
};

type ListedSession = {
	id: string;
	token: string;
	expiresAt: string | Date;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
	ipAddress?: string | null;
	location?: RequestLocation | null;
	userAgent?: string | null;
};

type DeviceSessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
};

type ListedDeviceSession = {
	session: ListedSession;
	user: DeviceSessionUser;
};

type ConfirmAction = "revoke-other" | "revoke-all" | null;

export function Sessions() {
	const { data: session } = useRequireSession();
	const [sessions, setSessions] = useState<ListedSession[]>([]);
	const [deviceSessions, setDeviceSessions] = useState<ListedDeviceSession[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
	const user = session?.user;
	const currentToken = session?.session.token;

	async function loadSessions() {
		setStatus(null);
		setBusy(true);
		const [sessionResult, deviceSessionResult] = await Promise.all([
			authClient.listSessions(),
			authClient.multiSession.listDeviceSessions(),
		]);
		setBusy(false);
		setLoaded(true);
		const errors: string[] = [];
		if (sessionResult.error) {
			errors.push(sessionResult.error.message ?? "Could not load sessions.");
		} else {
			setSessions((sessionResult.data ?? []) as ListedSession[]);
		}
		if (deviceSessionResult.error) {
			errors.push(deviceSessionResult.error.message ?? "Could not load signed-in accounts.");
		} else {
			setDeviceSessions((deviceSessionResult.data ?? []) as ListedDeviceSession[]);
		}
		if (errors.length) setStatus({ tone: "error", message: errors.join(" ") });
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

	async function setActiveDeviceSession(sessionToken: string) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.multiSession.setActive({ sessionToken });
		setBusy(false);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not switch accounts.",
			});
			return;
		}
		window.location.assign(window.location.pathname + window.location.search);
	}

	async function revokeDeviceSession(sessionToken: string) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.multiSession.revoke({ sessionToken });
		setBusy(false);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not revoke account session.",
			});
			return;
		}
		setStatus({ tone: "success", message: "Account session revoked." });
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
	const currentDeviceSession =
		user && session?.session
			? ({
					session: {
						id: session.session.id,
						token: session.session.token,
						expiresAt: session.session.expiresAt,
						createdAt: session.session.createdAt,
						updatedAt: session.session.updatedAt,
						ipAddress: session.session.ipAddress,
						userAgent: session.session.userAgent,
					},
					user: {
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
					},
				} satisfies ListedDeviceSession)
			: null;
	const otherDeviceSessions = deviceSessions
		.filter((item) => item.user.id !== user?.id && item.session.token !== currentToken)
		.sort((a, b) => a.user.email.localeCompare(b.user.email));
	const accountSessions = currentDeviceSession
		? [currentDeviceSession, ...otherDeviceSessions]
		: otherDeviceSessions;
	const otherAccountCount = accountSessions.filter((item) => item.user.id !== user?.id).length;

	return (
		<DashboardShell
			user={user}
			title="Sessions"
			description="Devices and browsers currently signed in to your Passport account."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			<section id="accounts" className="scroll-mt-32">
				<SettingsCard
					title="Signed-in accounts"
					description="Accounts available in this browser. Switch accounts without signing out elsewhere."
					footer={
						<SettingsCardFooter
							hint={
								loaded
									? `${otherAccountCount} other account${otherAccountCount === 1 ? "" : "s"} in this browser.`
									: "Loading accounts…"
							}
						>
							<div className="flex flex-wrap justify-end gap-2">
								<Button variant="outline" size="sm" onClick={loadSessions} disabled={busy}>
									<RefreshCw className={cn("size-4", busy && "animate-spin")} />
									Refresh
								</Button>
								<Button asChild size="sm">
									<a href={resolveAddAccountURL()}>
										<Plus className="size-4" />
										Add account
									</a>
								</Button>
							</div>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<DeviceSessionSkeletons />
						) : accountSessions.length ? (
							<ul className="divide-y">
								{accountSessions.map((item) => (
									<DeviceSessionRow
										key={`${item.user.id}:${item.session.token}`}
										deviceSession={item}
										currentUserId={user?.id}
										busy={busy}
										onSetActive={() => setActiveDeviceSession(item.session.token)}
										onRevoke={() => revokeDeviceSession(item.session.token)}
									/>
								))}
							</ul>
						) : (
							<p className="px-4 py-10 text-center text-sm text-muted-foreground">
								No accounts are available in this browser.
							</p>
						)}
					</div>
				</SettingsCard>
			</section>

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

export function DeviceSessionRow({
	deviceSession,
	currentUserId,
	busy,
	onSetActive,
	onRevoke,
}: {
	deviceSession: ListedDeviceSession;
	currentUserId?: string;
	busy: boolean;
	onSetActive: () => void;
	onRevoke: () => void;
}) {
	const current = deviceSession.user.id === currentUserId;

	return (
		<li className={cn("flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center", current && "bg-muted/40")}>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background text-muted-foreground">
					{deviceSession.user.image ? (
						<img
							src={deviceSession.user.image}
							alt=""
							className="size-full object-cover"
							referrerPolicy="no-referrer"
						/>
					) : (
						<UserRound className="size-[1.1rem]" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-sm font-medium">{deviceSession.user.name}</span>
						{current ? (
							<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium">
								<span className="size-1.5 rounded-full bg-emerald-500" />
								Current account
							</span>
						) : null}
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{deviceSession.user.email}
					</div>
				</div>
			</div>
			{current ? null : (
				<div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
					<Button
						variant="outline"
						size="sm"
						className="flex-1 sm:flex-none"
						onClick={onSetActive}
						disabled={busy}
					>
						<LogIn className="size-4" />
						Switch
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="flex-1 text-muted-foreground hover:text-destructive sm:flex-none"
						onClick={onRevoke}
						disabled={busy}
					>
						Revoke
					</Button>
				</div>
			)}
		</li>
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
	const { label, browser, os, deviceType } = parseUserAgent(session.userAgent);
	const location = formatRequestLocation(session.location);
	const meta = [
		location ?? session.ipAddress?.trim() ?? "Unknown location",
		current ? "Active now" : `Last active ${relativeTime(session.updatedAt ?? session.createdAt)}`,
	];

	return (
		<li className={cn("flex items-center gap-3 px-3.5 py-3", current && "bg-muted/40")}>
			<SessionAgentIcon browser={browser} os={os} deviceType={deviceType} />
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

function SessionAgentIcon({
	browser,
	os,
	deviceType,
}: {
	browser: string;
	os: string;
	deviceType: DeviceType;
}) {
	const browserIcon = BROWSER_ICONS[browser];
	const platformIcon = PLATFORM_ICONS[os];
	const primary = browserIcon ?? platformIcon;
	const secondary = browserIcon ? platformIcon : undefined;

	if (!primary) {
		const Icon = DEVICE_ICON[deviceType];
		return (
			<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
				<Icon className="size-[1.1rem]" />
			</div>
		);
	}

	return (
		<div
			className="relative grid size-9 shrink-0 place-items-center rounded-lg border bg-background"
			title={secondary ? `${primary.label} on ${secondary.label}` : primary.label}
		>
			<PublicIcon src={primary.src} className="size-5" />
			{secondary ? (
				<span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border bg-background shadow-xs">
					<PublicIcon src={secondary.src} className="size-2.5" />
				</span>
			) : null}
		</div>
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

function DeviceSessionSkeletons() {
	return (
		<ul className="divide-y">
			{[0, 1].map((index) => (
				<li key={index} className="flex items-center gap-3 px-3.5 py-3">
					<Skeleton className="size-9 shrink-0 rounded-lg" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-3.5 w-36" />
						<Skeleton className="h-3 w-48" />
					</div>
				</li>
			))}
		</ul>
	);
}
