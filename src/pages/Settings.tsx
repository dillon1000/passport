import { useEffect, useId, useState } from "react";
import {
	Bell,
	ChevronDown,
	Download,
	FileText,
	RefreshCw,
	Scale,
	ShieldCheck,
	XCircle,
} from "lucide-react";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FLAIR_STATIC_OPTIONS, useFlairMode, type FlairMode } from "@/lib/flair";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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

export function Settings() {
	const { data: session } = useRequireSession();
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [dataRequest, setDataRequest] = useState<DataExportRequestSummary | null>(null);
	const [preferences, setPreferences] = useState<EmailNotificationPreferences>(
		DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
	);
	const [drawer, setDrawer] = useState<LegalDrawer>(null);
	const user = session?.user as SettingsUser | undefined;
	const exportCancelable = dataRequest?.status === "pending";
	const exportRunning = dataRequest?.status === "pending" || dataRequest?.status === "processing";

	async function loadSettings() {
		setBusy("load");
		const [exportResponse, preferenceResponse] = await Promise.all([
			fetch("/api/data-export-requests/current"),
			fetch("/api/settings/notifications"),
		]);
		setBusy(null);
		if (!exportResponse.ok || !preferenceResponse.ok) {
			setStatus({ tone: "error", message: "Could not load settings." });
			return;
		}
		const exportPayload = (await exportResponse.json()) as {
			request: DataExportRequestSummary | null;
		};
		const preferencePayload = (await preferenceResponse.json()) as {
			preferences: EmailNotificationPreferences;
		};
		setDataRequest(exportPayload.request);
		setPreferences(preferencePayload.preferences);
	}

	useEffect(() => {
		if (!user) return;
		queueMicrotask(() => {
			void loadSettings();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.email]);

	async function requestExport() {
		setStatus(null);
		setBusy("request");
		const response = await fetch("/api/data-export-requests", { method: "POST" });
		const payload = (await response.json().catch(() => null)) as {
			request?: DataExportRequestSummary;
			error?: string;
		} | null;
		setBusy(null);
		if (!response.ok || !payload?.request) {
			setStatus({ tone: "error", message: payload?.error ?? "Could not request data export." });
			return;
		}
		setDataRequest(payload.request);
		setStatus({ tone: "success", message: "Data export requested. Check your email." });
	}

	async function cancelExport() {
		if (!dataRequest) return;
		setStatus(null);
		setBusy("cancel");
		const response = await fetch(`/api/data-export-requests/${dataRequest.id}/cancel`, {
			method: "POST",
		});
		const payload = (await response.json().catch(() => null)) as {
			request?: DataExportRequestSummary;
			error?: string;
		} | null;
		setBusy(null);
		if (!response.ok || !payload?.request) {
			setStatus({ tone: "error", message: payload?.error ?? "Could not cancel data export." });
			return;
		}
		setDataRequest(payload.request);
		setStatus({ tone: "success", message: "Data export canceled." });
	}

	async function saveNotifications() {
		setStatus(null);
		setBusy("notifications");
		const response = await fetch("/api/settings/notifications", {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify(preferences),
		});
		const payload = (await response.json().catch(() => null)) as {
			preferences?: EmailNotificationPreferences;
			error?: string;
		} | null;
		setBusy(null);
		if (!response.ok || !payload?.preferences) {
			setStatus({ tone: "error", message: payload?.error ?? "Could not save notifications." });
			return;
		}
		setPreferences(payload.preferences);
		setStatus({ tone: "success", message: "Notification settings saved." });
	}

	return (
		<DashboardShell
			user={user}
			title="Settings"
			description="Manage privacy exports, email notifications, and legal documents."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

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
					<DataExportSummary request={dataRequest} loading={busy === "load"} />
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
							setPreferences((current) => ({ ...current, securityAlerts: checked }))
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
			<div className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm text-muted-foreground">
				<RefreshCw className="size-4 animate-spin" />
				Loading export status...
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
			<div className="truncate text-sm font-medium capitalize">{value}</div>
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
			className="flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
			<SheetContent className="max-w-xl">
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
