/**
 * Webhooks admin page. Inputs are the operator session and the webhook
 * subscription API under `/api/admin/webhooks`; outputs are endpoint management
 * (create, enable/disable, rotate secret, confirmed delete), one-time signing
 * secret copy, and a recent-delivery view. Event-type wording comes from the
 * shared `webhook-events` map. Signing secrets are shown exactly once, right
 * after create or rotate, and never refetched.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Check, Copy, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { Banner } from "@cloudflare/kumo";

import { DashboardShell } from "@/components/auth/dashboard-shell";
import { CheckboxField, Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
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
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { Loader } from "@/components/kumo/primitives/loader";
import {
	WEBHOOK_EVENT_TYPE_VALUES,
	webhookEventLabel,
} from "@/lib/webhook-events";
import { fetchAPIJSON, queryKeys, readAPIJSON } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";

const SECTIONS: Section[] = [
	{ id: "create", label: "New endpoint" },
	{ id: "endpoints", label: "Endpoints" },
];

type WebhookEndpoint = {
	id: string;
	url: string;
	events: string[];
	description?: string | null;
	disabled: boolean;
	createdAt: string;
};

type WebhookEndpointWithSecret = WebhookEndpoint & { secret: string };

type WebhookDelivery = {
	id: string;
	eventType: string;
	status: string;
	attempts: number;
	responseStatus?: number | null;
	error?: string | null;
	createdAt: string;
	deliveredAt?: string | null;
};

async function fetchWebhookEndpoints() {
	const payload = await fetchAPIJSON<{ endpoints: WebhookEndpoint[] }>("/api/admin/webhooks?limit=50");
	return payload.endpoints;
}

function deliveryTone(status: string) {
	if (status === "delivered") return "default";
	if (status === "failed") return "destructive";
	return "outline";
}

export function Webhooks() {
	const { data: session } = useRequireSession();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);
	const [revealedSecret, setRevealedSecret] = useState<WebhookEndpointWithSecret | null>(null);
	const [secretCopied, setSecretCopied] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);

	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

	const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
	const endpointsQuery = useQuery({
		queryKey: queryKeys.webhooks(),
		queryFn: fetchWebhookEndpoints,
		enabled: Boolean(session?.user),
	});
	const endpoints = endpointsQuery.data ?? [];
	const loaded = endpointsQuery.isFetched;
	const loadingEndpoints = endpointsQuery.isFetching;
	const queryStatus =
		status ??
		(endpointsQuery.error instanceof Error
			? { tone: "error" as const, message: endpointsQuery.error.message }
			: null);

	function loadEndpoints() {
		setStatus(null);
		void endpointsQuery.refetch();
	}

	function toggleEvent(type: string, checked: boolean) {
		setSelectedEvents((current) =>
			checked ? [...new Set([...current, type])] : current.filter((value) => value !== type),
		);
	}

	async function createEndpoint(event: FormEvent) {
		event.preventDefault();
		if (selectedEvents.length === 0) {
			setStatus({ tone: "error", message: "Select at least one event to subscribe to." });
			return;
		}
		setBusy(true);
		setStatus(null);
		try {
			const payload = await readAPIJSON<{ endpoint: WebhookEndpointWithSecret }>(
				await fetch("/api/admin/webhooks", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						url,
						events: selectedEvents,
						...(description.trim() ? { description: description.trim() } : {}),
					}),
				}),
			);
			setRevealedSecret(payload.endpoint);
			setSecretCopied(false);
			setUrl("");
			setDescription("");
			setSelectedEvents([]);
			setStatus({ tone: "success", message: "Webhook endpoint created." });
			void endpointsQuery.refetch();
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not create webhook.",
			});
		} finally {
			setBusy(false);
		}
	}

	async function setDisabled(endpoint: WebhookEndpoint, disabled: boolean) {
		setBusy(true);
		const response = await fetch(`/api/admin/webhooks/${endpoint.id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ disabled }),
		});
		setBusy(false);
		if (!response.ok) {
			setStatus({ tone: "error", message: "Could not update webhook." });
			return;
		}
		void endpointsQuery.refetch();
	}

	async function rotateSecret(endpoint: WebhookEndpoint) {
		setBusy(true);
		const response = await fetch(`/api/admin/webhooks/${endpoint.id}/rotate-secret`, {
			method: "POST",
		});
		setBusy(false);
		if (!response.ok) {
			setStatus({ tone: "error", message: "Could not rotate secret." });
			return;
		}
		const payload = (await response.json()) as { endpoint: WebhookEndpointWithSecret };
		setRevealedSecret(payload.endpoint);
		setSecretCopied(false);
		setStatus({ tone: "success", message: "Signing secret rotated." });
	}

	async function deleteEndpoint(endpoint: WebhookEndpoint) {
		setBusy(true);
		const response = await fetch(`/api/admin/webhooks/${endpoint.id}`, { method: "DELETE" });
		setBusy(false);
		if (!response.ok && response.status !== 204) {
			setStatus({ tone: "error", message: "Could not delete webhook." });
			return;
		}
		setDeleteTarget(null);
		setStatus({ tone: "success", message: "Webhook endpoint deleted." });
		void endpointsQuery.refetch();
	}

	async function copyRevealedSecret() {
		if (!revealedSecret?.secret) return;
		try {
			await navigator.clipboard.writeText(revealedSecret.secret);
			setSecretCopied(true);
			window.setTimeout(() => setSecretCopied(false), 1500);
		} catch {
			setStatus({ tone: "error", message: "Could not copy the signing secret." });
		}
	}

	async function loadDeliveries(endpoint: WebhookEndpoint) {
		try {
			const payload = await queryClient.fetchQuery({
				queryKey: queryKeys.webhookDeliveries(endpoint.id),
				queryFn: () =>
					fetchAPIJSON<{ deliveries: WebhookDelivery[] }>(
						`/api/admin/webhooks/${endpoint.id}/deliveries?limit=20`,
					),
			});
			setDeliveries((current) => ({ ...current, [endpoint.id]: payload.deliveries }));
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not load deliveries.",
			});
		}
	}

	return (
		<DashboardShell
			user={session?.user}
			title="Webhooks"
			description="Deliver identity lifecycle events to your other applications."
			sections={SECTIONS}
		>
			<StatusBanner status={queryStatus} />

			{revealedSecret ? (
				<Banner variant="alert" title="Copy this signing secret now" description={<>
						<span>
							This is the only time the secret for{" "}
							<span className="font-medium">{revealedSecret.url}</span> is shown. Use it to
							verify the <code>x-passport-signature</code> header.
						</span>
						<code className="mt-2 block w-full break-all rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
							{revealedSecret.secret}
						</code>
						<div className="mt-2 flex flex-wrap gap-2">
							<Button variant="outline" size="sm" onClick={copyRevealedSecret}>
								{secretCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
								{secretCopied ? "Copied" : "Copy secret"}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setRevealedSecret(null);
									setSecretCopied(false);
								}}
							>
								Done
							</Button>
						</div>
					</>} />
			) : null}

			<section id="create" className="scroll-mt-32">
				<SettingsCard
					title="New endpoint"
					description="POST signed JSON to an https URL whenever a subscribed event fires."
				>
					<form className="space-y-4" onSubmit={createEndpoint}>
						<Field label="Endpoint URL">
							<FieldInput
								type="url"
								required
								placeholder="https://app.example.com/webhooks/passport"
								value={url}
								onChange={(event) => setUrl(event.target.value)}
							/>
						</Field>
						<Field label="Description">
							<FieldTextarea
								rows={2}
								placeholder="What this endpoint is for (optional)."
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</Field>
						<div className="space-y-2">
							<p className="text-sm font-medium">Events</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{WEBHOOK_EVENT_TYPE_VALUES.map((type) => (
									<CheckboxField
										key={type}
										checked={selectedEvents.includes(type)}
										onCheckedChange={(checked) => toggleEvent(type, checked)}
										label={webhookEventLabel(type)}
										hint={type}
									/>
								))}
							</div>
						</div>
						<Button type="submit" disabled={busy}>
							<Plus className="size-4" />
							Create endpoint
						</Button>
					</form>
				</SettingsCard>
			</section>

			<section id="endpoints" className="scroll-mt-32">
				<SettingsCard
					title="Endpoints"
					description="Registered webhook subscriptions and their recent deliveries."
					footer={
						<SettingsCardFooter
							hint={
								loaded ? (
									`${endpoints.length} endpoint${endpoints.length === 1 ? "" : "s"}.`
								) : (
									<Skeleton className="h-3 w-32" />
								)
							}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={loadEndpoints}
								disabled={busy || loadingEndpoints}
							>
								{busy || loadingEndpoints ? (
									<Loader size="sm" />
								) : (
									<RefreshCw className="size-4" />
								)}
								Refresh
							</Button>
						</SettingsCardFooter>
					}
				>
					<div className="overflow-hidden rounded-lg border">
						{!loaded ? (
							<EndpointSkeletons />
						) : endpoints.length ? (
							<ul className="divide-y">
								{endpoints.map((endpoint) => (
									<li key={endpoint.id} className="space-y-3 px-3.5 py-3.5">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="min-w-0 space-y-1.5">
												<div className="flex flex-wrap items-center gap-2">
													<span className="truncate font-mono text-sm">{endpoint.url}</span>
													<Badge variant={endpoint.disabled ? "outline" : "default"}>
														{endpoint.disabled ? "Disabled" : "Active"}
													</Badge>
												</div>
												{endpoint.description ? (
													<p className="text-xs text-muted-foreground">{endpoint.description}</p>
												) : null}
												<div className="flex flex-wrap gap-1.5">
													{endpoint.events.map((type) => (
														<Badge key={type} variant="outline" className="font-normal">
															{webhookEventLabel(type)}
														</Badge>
													))}
												</div>
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => loadDeliveries(endpoint)}
													disabled={busy}
												>
													<Send className="size-4" />
													Deliveries
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setDisabled(endpoint, !endpoint.disabled)}
													disabled={busy}
												>
													{endpoint.disabled ? "Enable" : "Disable"}
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => rotateSecret(endpoint)}
													disabled={busy}
												>
													Rotate secret
												</Button>
												<Button
													variant="destructive"
													size="sm"
													onClick={() => setDeleteTarget(endpoint)}
													disabled={busy}
												>
													<Trash2 className="size-4" />
													<span className="sr-only">Delete endpoint</span>
												</Button>
											</div>
										</div>

										{deliveries[endpoint.id] ? (
											deliveries[endpoint.id]!.length ? (
												<ul className="divide-y rounded-md border bg-muted/30 text-xs">
													{deliveries[endpoint.id]!.map((delivery) => (
														<li
															key={delivery.id}
															className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5"
														>
															<Badge variant={deliveryTone(delivery.status)}>
																{delivery.status}
															</Badge>
															<span className="font-mono">{delivery.eventType}</span>
															<span className="text-muted-foreground">
																{delivery.attempts} attempt
																{delivery.attempts === 1 ? "" : "s"}
																{delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ""}
															</span>
															<time
																className="ml-auto text-muted-foreground"
																dateTime={delivery.createdAt}
															>
																{new Date(delivery.createdAt).toLocaleString()}
															</time>
															{delivery.error ? (
																<span className="w-full text-destructive">{delivery.error}</span>
															) : null}
														</li>
													))}
												</ul>
											) : (
												<p className="text-xs text-muted-foreground">No deliveries yet.</p>
											)
										) : null}
									</li>
								))}
							</ul>
						) : (
							<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
								<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
									<Webhook className="size-5" />
								</div>
								<p className="text-sm font-medium">No webhook endpoints yet</p>
							</div>
						)}
					</div>
				</SettingsCard>
			</section>
			<Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete webhook endpoint?</DialogTitle>
						<DialogDescription>
							This will permanently stop deliveries to{" "}
							<span className="font-medium text-foreground">{deleteTarget?.url}</span>.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</DialogClose>
						<Button
							type="button"
							variant="destructive"
							disabled={busy || !deleteTarget}
							onClick={() => {
								if (deleteTarget) void deleteEndpoint(deleteTarget);
							}}
						>
							Delete endpoint
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</DashboardShell>
	);
}

function EndpointSkeletons() {
	return (
		<ul className="divide-y">
			{[0, 1].map((index) => (
				<li key={index} className="space-y-2 px-3.5 py-3.5">
					<Skeleton className="h-4 w-72 max-w-full" />
					<Skeleton className="h-3 w-48" />
				</li>
			))}
		</ul>
	);
}
