/**
 * Account settings page. Inputs are the signed-in session, notification
 * preferences, data-export summaries, legal copy, and local flair settings;
 * outputs are account preference updates and legal/data-export workflows.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
	Bell,
	ChevronDown,
	Download,
	FileText,
	Scale,
	ShieldCheck,
	XCircle,
} from "@/lib/icons";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/kumo/primitives/button";
import { Label } from "@/components/kumo/primitives/label";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { FLAIR_STATIC_OPTIONS, useFlairMode, type FlairMode } from "@/lib/flair";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/kumo/primitives/sheet";
import type { DataExportRequestSummary } from "@/lib/data-export";
import {
	legalUpdatedAt,
	privacyPolicySections,
	termsOfServiceSections,
	type LegalSection,
} from "@/lib/legal";
import {
	DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
	type EmailNotificationPreferences,
} from "@/lib/notification-preferences";
import { fetchAPIJSON, queryKeys, readAPIJSON } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [
	{ id: "appearance", label: "Appearance" },
	{ id: "data", label: "Data" },
	{ id: "notifications", label: "Notifications" },
	{ id: "legal", label: "Legal" },
];

type SettingsUser = {
	name?: string | null;
	email: string;
	image?: string | null;
	role?: string | null;
};

type LegalDrawer = "privacy" | "terms" | null;

type SettingsPayload = {
	request: DataExportRequestSummary | null;
	preferences: EmailNotificationPreferences;
};

async function fetchSettingsPayload(): Promise<SettingsPayload> {
	const [exportPayload, preferencePayload] = await Promise.all([
		fetchAPIJSON<{ request: DataExportRequestSummary | null }>(
			"/api/data-export-requests/current",
		),
		fetchAPIJSON<{ preferences: EmailNotificationPreferences }>(
			"/api/settings/notifications",
		),
	]);
	return {
		request: exportPayload.request,
		preferences: preferencePayload.preferences,
	};
}

export function Settings() {
	const { data: session } = useRequireSession();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [preferenceDraft, setPreferenceDraft] = useState<EmailNotificationPreferences | null>(null);
	const [drawer, setDrawer] = useState<LegalDrawer>(null);
	const user = session?.user as SettingsUser | undefined;
	const settingsQuery = useQuery({
		queryKey: queryKeys.settings(user?.email),
		queryFn: fetchSettingsPayload,
		enabled: Boolean(user),
	});
	const dataRequest = settingsQuery.data?.request ?? null;
	const preferences =
		preferenceDraft ?? settingsQuery.data?.preferences ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES;
	const exportCancelable = dataRequest?.status === "pending";
	const exportRunning = dataRequest?.status === "pending" || dataRequest?.status === "processing";
	const queryStatus =
		status ??
		(settingsQuery.error instanceof Error
			? { tone: "error" as const, message: settingsQuery.error.message }
			: null);

	function updateSettingsCache(patch: Partial<SettingsPayload>) {
		queryClient.setQueryData<SettingsPayload>(queryKeys.settings(user?.email), (current) => ({
			request: current?.request ?? null,
			preferences: current?.preferences ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
			...patch,
		}));
	}

	async function requestExport() {
		setStatus(null);
		setBusy("request");
		try {
			const payload = await readAPIJSON<{ request: DataExportRequestSummary }>(
				await fetch("/api/data-export-requests", { method: "POST" }),
			);
			updateSettingsCache({ request: payload.request });
			setStatus({ tone: "success", message: "Data export requested. Check your email." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not request data export.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function cancelExport() {
		if (!dataRequest) return;
		setStatus(null);
		setBusy("cancel");
		try {
			const payload = await readAPIJSON<{ request: DataExportRequestSummary }>(
				await fetch(`/api/data-export-requests/${dataRequest.id}/cancel`, {
					method: "POST",
				}),
			);
			updateSettingsCache({ request: payload.request });
			setStatus({ tone: "success", message: "Data export canceled." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not cancel data export.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function saveNotifications() {
		setStatus(null);
		setBusy("notifications");
		try {
			const payload = await readAPIJSON<{ preferences: EmailNotificationPreferences }>(
				await fetch("/api/settings/notifications", {
					method: "PATCH",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify(preferences),
				}),
			);
			setPreferenceDraft(payload.preferences);
			updateSettingsCache({ preferences: payload.preferences });
			setStatus({ tone: "success", message: "Notification settings saved." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not save notifications.",
			});
		} finally {
			setBusy(null);
		}
	}

	return (
		<DashboardShell
			user={user}
			title="Settings"
			description="Manage privacy exports, email notifications, and legal documents."
			sections={SECTIONS}
		>
			<StatusBanner status={queryStatus} />

			<section id="appearance" className="scroll-mt-32">
				<SettingsCard
					title="Profile Display"
					description="Choose the text shown beside your avatar in the top bar."
					footer={<SettingsCardFooter hint="Changes apply instantly." />}
				>
					<ProfileFlairSetting />
				</SettingsCard>
			</section>

			<section id="data" className="scroll-mt-32">
				<SettingsCard
					title="Account Data"
					description="Request a ZIP archive of account records stored by Passport."
					footer={
						<SettingsCardFooter hint={dataRequest ? exportStatusText(dataRequest) : "No export requested."}>
							<div className="flex gap-2">
								{exportCancelable ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={cancelExport}
										disabled={busy === "cancel"}
									>
										<XCircle className="size-4" />
										Cancel
									</Button>
								) : null}
								<Button
									type="button"
									size="sm"
									onClick={requestExport}
									disabled={Boolean(busy) || exportRunning}
								>
									<Download className="size-4" />
									Request all data
								</Button>
							</div>
						</SettingsCardFooter>
					}
				>
					<DataExportSummary request={dataRequest} loading={settingsQuery.isLoading} />
				</SettingsCard>
			</section>

			<section id="notifications" className="scroll-mt-32">
				<SettingsCard
					title="Email Notifications"
					description="Choose which account security emails Passport sends."
					footer={
						<SettingsCardFooter hint="Data export request and download emails are always sent.">
							<Button
								type="button"
								size="sm"
								onClick={saveNotifications}
								disabled={busy === "notifications"}
							>
								<Bell className="size-4" />
								Save
							</Button>
						</SettingsCardFooter>
					}
				>
					<CheckboxField
						checked={preferences.securityAlerts}
						onCheckedChange={(checked) =>
							setPreferenceDraft((current) => ({
								...(current ?? preferences),
								securityAlerts: checked,
							}))
						}
						label="Security alerts"
						hint="New device sign-ins and changes to email, password, social accounts, phone, passkeys, or 2FA."
						disabled={busy === "notifications"}
					/>
				</SettingsCard>
			</section>

			<section id="legal" className="scroll-mt-32">
				<SettingsCard
					title="Legal"
					description={`Privacy Policy and Terms of Service. Updated ${legalUpdatedAt}.`}
					footer={<SettingsCardFooter hint="Opens in a side drawer." />}
				>
					<div className="grid gap-3 sm:grid-cols-2">
						<LegalButton
							icon={FileText}
							title="Privacy Policy"
							description="How Passport collects, uses, exports, and retains account data."
							onClick={() => setDrawer("privacy")}
						/>
						<LegalButton
							icon={Scale}
							title="Terms of Service"
							description="Rules for account access, connected applications, and service use."
							onClick={() => setDrawer("terms")}
						/>
					</div>
				</SettingsCard>
			</section>

			<LegalSheet
				open={drawer !== null}
				onOpenChange={(open) => !open && setDrawer(null)}
				title={drawer === "terms" ? "Terms of Service" : "Privacy Policy"}
				sections={drawer === "terms" ? termsOfServiceSections : privacyPolicySections}
			/>
		</DashboardShell>
	);
}

function exportStatusText(request: DataExportRequestSummary) {
	if (request.status === "pending") {
		return `Cancelable until ${new Date(request.cancelableUntil).toLocaleString()}.`;
	}
	if (request.status === "processing") return "Preparing archive.";
	if (request.status === "completed") return "Download link sent by email.";
	if (request.status === "canceled") return "Canceled.";
	if (request.status === "failed") return request.errorMessage ?? "Export failed.";
	return "Unknown status.";
}

function DataExportSummary({
	request,
	loading,
}: {
	request: DataExportRequestSummary | null;
	loading: boolean;
}) {
	if (loading) {
		return (
			<div className="flex items-center gap-3 rounded-lg border px-3 py-3">
				<Skeleton className="size-4 rounded-full" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-3.5 w-36" />
					<Skeleton className="h-3 w-52 max-w-full" />
				</div>
			</div>
		);
	}

	if (!request) {
		return (
			<div className="flex items-center gap-3 rounded-lg border px-3 py-3">
				<ShieldCheck className="size-4 text-muted-foreground" />
				<div>
					<div className="text-sm font-medium">No active data export</div>
					<div className="text-xs text-muted-foreground">Exports are prepared only after request.</div>
				</div>
			</div>
		);
	}

	return (
		<div className="grid gap-3 rounded-lg border px-3 py-3 sm:grid-cols-3">
			<SummaryValue label="Status" value={request.status} />
			<SummaryValue label="Requested" value={new Date(request.requestedAt).toLocaleString()} />
			<SummaryValue label="Expires" value={request.expiresAt ? new Date(request.expiresAt).toLocaleString() : "Not ready"} />
		</div>
	);
}

function SummaryValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="truncate text-sm font-medium tabular-nums capitalize">{value}</div>
		</div>
	);
}

function ProfileFlairSetting() {
	const { mode, setMode } = useFlairMode();
	const selectId = useId();
	const isStatic = mode !== "rotate";
	const [choice, setChoice] = useState<Exclude<FlairMode, "rotate">>(
		mode === "rotate" ? "greeting" : mode,
	);

	return (
		<div className="space-y-4">
			<CheckboxField
				checked={isStatic}
				onCheckedChange={(checked) => setMode(checked ? choice : "rotate")}
				label="Show static text"
				hint="Stop the rotating name, email, date, and greeting and keep one in view."
			/>
			<div className="space-y-1.5">
				<Label
					htmlFor={selectId}
					className={cn("font-normal", !isStatic && "text-muted-foreground")}
				>
					Text to show
				</Label>
				<div className="relative max-w-xs">
					<select
						id={selectId}
						value={choice}
						disabled={!isStatic}
						onChange={(event) => {
							const next = event.target.value as Exclude<FlairMode, "rotate">;
							setChoice(next);
							setMode(next);
						}}
						className="h-9 w-full appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:bg-input/30"
					>
						{FLAIR_STATIC_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
				</div>
			</div>
		</div>
	);
}

function LegalButton({
	icon: Icon,
	title,
	description,
	onClick,
}: {
	icon: typeof FileText;
	title: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-start gap-3 rounded-lg border px-3 py-3 text-left shadow-sm shadow-black/[0.04] transition-[scale,background-color,box-shadow] duration-150 ease-out hover:bg-muted/50 hover:shadow-black/[0.06] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0">
				<span className="block text-sm font-medium">{title}</span>
				<span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
					{description}
				</span>
			</span>
		</button>
	);
}

function LegalSheet({
	open,
	onOpenChange,
	title,
	sections,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	sections: LegalSection[];
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="[--sheet-width:36rem]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
				</SheetHeader>
				<SheetBody className="space-y-6">
					<p className="text-sm text-muted-foreground">Updated {legalUpdatedAt}</p>
					{sections.map((section) => (
						<section key={section.title} className="space-y-2">
							<h2 className="text-sm font-medium">{section.title}</h2>
							{section.body.map((paragraph) => (
								<p
									key={paragraph}
									className={cn("text-sm leading-6 text-muted-foreground")}
								>
									{paragraph}
								</p>
							))}
						</section>
					))}
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}
