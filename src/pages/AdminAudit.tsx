/**
 * Admin audit timeline. Inputs are server-recorded audit events from the worker
 * API; outputs are a read-only operator timeline for privileged mutations.
 * Keep event formatting local to this page so new audit actions can be added
 * without changing storage.
 */
import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRequestLocation, type RequestLocation } from "@/lib/request-location";
import { useRequireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS: Section[] = [{ id: "events", label: "Events" }];

type AuditEvent = {
	id: string;
	createdAt: string;
	actorUserId?: string | null;
	actorEmail?: string | null;
	action: string;
	targetType: string;
	targetId?: string | null;
	targetLabel?: string | null;
	organizationId?: string | null;
	ipAddress?: string | null;
	location?: RequestLocation | null;
	metadata?: unknown;
};

type AuditPayload = {
	events: AuditEvent[];
};

function actionLabel(action: string) {
	return action
		.split(".")
		.map((part) => part.replace(/_/g, " "))
		.join(" / ");
}

function metadataSummary(value: unknown) {
	if (!value || typeof value !== "object") return "";
	const entries = Object.entries(value as Record<string, unknown>);
	return entries
		.slice(0, 3)
		.map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`)
		.join(" · ");
}

function eventLocationSummary(event: AuditEvent) {
	return formatRequestLocation(event.location) ?? event.ipAddress ?? null;
}

export function AdminAudit() {
	const { data: session } = useRequireSession();
	const [events, setEvents] = useState<AuditEvent[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);

	async function loadEvents() {
		setBusy(true);
		setStatus(null);
		const response = await fetch("/api/admin/audit-events?limit=50");
		setBusy(false);
		setLoaded(true);
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as { error?: string } | null;
			setEvents([]);
			setStatus({ tone: "error", message: payload?.error ?? "Could not load audit events." });
			return;
		}
		const payload = (await response.json()) as AuditPayload;
		setEvents(payload.events);
	}

	useEffect(() => {
		if (!session?.user) return;
		queueMicrotask(() => {
			void loadEvents();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.user?.id]);

	return (
		<DashboardShell
			user={session?.user}
			title="Audit"
			description="Review privileged user and OAuth client mutations."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			<section id="events" className="scroll-mt-32">
				<SettingsCard
					title="Admin events"
					description="Server-recorded timeline for operator actions."
					footer={
						<SettingsCardFooter
							hint={
								loaded
									? `${events.length} event${events.length === 1 ? "" : "s"} shown.`
									: "Loading events..."
							}
						>
							<Button variant="outline" size="sm" onClick={loadEvents} disabled={busy}>
								<RefreshCw className={cn("size-4", busy && "animate-spin")} />
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<EventSkeletons />
						) : events.length ? (
							<ul className="divide-y">
								{events.map((event) => (
									<li key={event.id} className="grid gap-2 px-3.5 py-3 lg:grid-cols-[1fr_auto]">
										<div className="min-w-0 space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="outline" className="capitalize">
													{actionLabel(event.action)}
												</Badge>
												<span className="truncate text-sm font-medium">
													{event.targetLabel ?? event.targetId ?? event.targetType}
												</span>
											</div>
											<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
												<div className="flex gap-1.5">
													<dt className="text-muted-foreground/70">Actor</dt>
													<dd>{event.actorEmail ?? event.actorUserId ?? "Unknown"}</dd>
												</div>
												<div className="flex gap-1.5">
													<dt className="text-muted-foreground/70">Target</dt>
													<dd className="font-mono">
														{event.targetType}:{event.targetId ?? "unknown"}
													</dd>
												</div>
												{eventLocationSummary(event) ? (
													<div className="flex gap-1.5">
														<dt className="text-muted-foreground/70">Location</dt>
														<dd>{eventLocationSummary(event)}</dd>
													</div>
												) : null}
												{event.ipAddress ? (
													<div className="flex gap-1.5">
														<dt className="text-muted-foreground/70">IP</dt>
														<dd className="font-mono">{event.ipAddress}</dd>
													</div>
												) : null}
											</dl>
											{metadataSummary(event.metadata) ? (
												<p className="truncate text-xs text-muted-foreground">
													{metadataSummary(event.metadata)}
												</p>
											) : null}
										</div>
										<time className="text-xs text-muted-foreground" dateTime={event.createdAt}>
											{new Date(event.createdAt).toLocaleString()}
										</time>
									</li>
								))}
							</ul>
						) : (
							<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
								<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
									<ShieldCheck className="size-5" />
								</div>
								<p className="text-sm font-medium">No audit events yet</p>
							</div>
						)}
					</div>
				</SettingsCard>
			</section>
		</DashboardShell>
	);
}

function EventSkeletons() {
	return (
		<ul className="divide-y">
			{[0, 1, 2].map((index) => (
				<li key={index} className="space-y-2 px-3.5 py-3">
					<Skeleton className="h-4 w-56" />
					<Skeleton className="h-3 w-80 max-w-full" />
				</li>
			))}
		</ul>
	);
}
