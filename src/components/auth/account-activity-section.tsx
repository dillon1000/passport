/**
 * Account activity feed. Inputs are the persisted account_activity_event rows
 * for the signed-in user, fetched from `/api/account/activity`; output is a
 * read-only, paginated security timeline rendered inside the Security page.
 * Event wording comes from the shared account-activity label map so it matches
 * the security-alert emails. This component owns its own data fetching so the
 * large Security page does not need to thread additional state.
 */
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";

import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import {
	accountActivityLabel,
	type AccountActivitySummary,
} from "@/lib/account-activity";
import { fetchAPIJSON, queryKeys } from "@/lib/query-client";
import { formatRequestLocation } from "@/lib/request-location";

type ActivityPayload = {
	events: AccountActivitySummary[];
};

const PAGE_LIMIT = 25;

function locationSummary(event: AccountActivitySummary) {
	return formatRequestLocation(event.location) ?? event.ipAddress ?? null;
}

function connectedAppSummary(event: AccountActivitySummary) {
	if (event.type !== "connected_app_action" || !event.metadata) return null;
	const client = typeof event.metadata.clientName === "string" ? event.metadata.clientName : null;
	const action = typeof event.metadata.action === "string" ? event.metadata.action : null;
	if (!client && !action) return null;
	return [client, action].filter(Boolean).join(" · ");
}

export function AccountActivitySection({ userId }: { userId: string | undefined }) {
	const activityQuery = useQuery({
		queryKey: queryKeys.accountActivity(userId),
		queryFn: async () => {
			const payload = await fetchAPIJSON<ActivityPayload>(
				`/api/account/activity?limit=${PAGE_LIMIT}`,
			);
			return payload.events;
		},
		enabled: Boolean(userId),
	});
	const events = activityQuery.data ?? [];
	const loaded = activityQuery.isFetched;
	const busy = activityQuery.isFetching;
	const error = activityQuery.error instanceof Error ? activityQuery.error.message : null;

	return (
		<SettingsCard
			title="Recent activity"
			description="Security events and changes made by apps connected to your account."
			footer={
					<SettingsCardFooter
						hint={
							error ? (
								error
							) : loaded ? (
								<>
									<span className="tabular-nums">{events.length}</span> event
									{events.length === 1 ? "" : "s"} shown.
								</>
							) : (
								<Skeleton className="h-3 w-28" />
							)
						}
					>
						<Button variant="outline" size="sm" onClick={() => activityQuery.refetch()} disabled={busy}>
							{busy ? <Skeleton className="size-4 rounded-full" /> : <RefreshCw className="size-4" />}
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
									{connectedAppSummary(event) ? (
										<p className="truncate text-xs text-muted-foreground">
											{connectedAppSummary(event)}
										</p>
									) : null}
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
