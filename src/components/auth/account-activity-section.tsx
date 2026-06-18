/**
 * Account activity feed. Inputs are the persisted account_activity_event rows
 * for the signed-in user, fetched from `/api/account/activity`; output is a
 * read-only, paginated security timeline rendered inside the Security page.
 * Event wording comes from the shared account-activity label map so it matches
 * the security-alert emails. This component owns its own data fetching so the
 * large Security page does not need to thread additional state.
 */
import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";

import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	accountActivityLabel,
	type AccountActivitySummary,
} from "@/lib/account-activity";
import { formatRequestLocation } from "@/lib/request-location";
import { cn } from "@/lib/utils";

type ActivityPayload = {
	events: AccountActivitySummary[];
};

const PAGE_LIMIT = 25;

function locationSummary(event: AccountActivitySummary) {
	return formatRequestLocation(event.location) ?? event.ipAddress ?? null;
}

export function AccountActivitySection({ userId }: { userId: string | undefined }) {
	const [events, setEvents] = useState<AccountActivitySummary[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadEvents = useCallback(async () => {
		setBusy(true);
		setError(null);
		const response = await fetch(`/api/account/activity?limit=${PAGE_LIMIT}`);
		setBusy(false);
		setLoaded(true);
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as { error?: string } | null;
			setEvents([]);
			setError(payload?.error ?? "Could not load account activity.");
			return;
		}
		const payload = (await response.json()) as ActivityPayload;
		setEvents(payload.events);
	}, []);

	useEffect(() => {
		if (!userId) return;
		queueMicrotask(() => {
			void loadEvents();
		});
	}, [userId, loadEvents]);

	return (
		<SettingsCard
			title="Recent activity"
			description="Security events on your account, such as sign-ins and credential changes."
			footer={
				<SettingsCardFooter
					hint={
						error
							? error
							: loaded
								? `${events.length} event${events.length === 1 ? "" : "s"} shown.`
								: "Loading activity..."
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
					<ActivitySkeletons />
				) : events.length ? (
					<ul className="divide-y">
						{events.map((event) => (
							<li key={event.id} className="grid gap-2 px-3.5 py-3 lg:grid-cols-[1fr_auto]">
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline">{accountActivityLabel(event.type)}</Badge>
									</div>
									<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
										{locationSummary(event) ? (
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">Location</dt>
												<dd>{locationSummary(event)}</dd>
											</div>
										) : null}
										{event.ipAddress ? (
											<div className="flex gap-1.5">
												<dt className="text-muted-foreground/70">IP</dt>
												<dd className="font-mono">{event.ipAddress}</dd>
											</div>
										) : null}
									</dl>
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
							<History className="size-5" />
						</div>
						<p className="text-sm font-medium">No account activity yet</p>
					</div>
				)}
			</div>
		</SettingsCard>
	);
}

function ActivitySkeletons() {
	return (
		<ul className="divide-y">
			{[0, 1, 2].map((index) => (
				<li key={index} className="space-y-2 px-3.5 py-3">
					<Skeleton className="h-4 w-44" />
					<Skeleton className="h-3 w-64 max-w-full" />
				</li>
			))}
		</ul>
	);
}
