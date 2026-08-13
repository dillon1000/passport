/**
 * Passport-hosted confirmation for delegated billing actions. The browser
 * session must belong to the intent's OAuth subject; this page shows the live
 * client/target summary, asks for an explicit confirmation, and then follows
 * the replay-safe Stripe or client return URL supplied by the Worker.
 */
import { useEffect, useState } from "react";
import { ArrowRight, CreditCard, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";

import { BillingShell } from "@/components/auth/billing-shell";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { Loader } from "@/components/kumo/primitives/loader";
import { useRequireSession } from "@/lib/session";

type BillingActionDetails = {
	id: string;
	action: "checkout" | "portal" | "cancel_subscription" | "restore_subscription";
	status: string;
	expiresAt: string;
	client: { id: string; name: string };
	target: { type: "user" | "organization"; id: string; label: string };
	product?: { id: string; name: string; label?: string | null };
	subscription?: { id: string; plan: string; status: string };
	resultUrl?: string | null;
};

const ACTION_COPY = {
	checkout: {
		title: "Confirm checkout",
		description: "Continue to a secure hosted checkout for this product.",
		button: "Continue to checkout",
	},
	portal: {
		title: "Open billing portal",
		description: "Open the hosted portal for this billing account.",
		button: "Open billing portal",
	},
	cancel_subscription: {
		title: "Manage cancellation",
		description: "Continue to the hosted cancellation confirmation.",
		button: "Continue",
	},
	restore_subscription: {
		title: "Restore subscription",
		description: "Restore this subscription using your Passport billing account.",
		button: "Restore subscription",
	},
} as const;

async function readData<T>(response: Response): Promise<T> {
	const payload = (await response.json()) as {
		data?: T;
		error?: { message?: string };
	};
	if (!response.ok || payload.data === undefined) {
		throw new Error(payload.error?.message ?? "Could not load this billing action.");
	}
	return payload.data;
}

export function BillingAction() {
	const { data: session } = useRequireSession();
	const user = session?.user;
	const { intentId } = useParams();
	const [details, setDetails] = useState<BillingActionDetails | null>(null);
	const [loadedAt] = useState(() => Date.now());
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);

	useEffect(() => {
		if (!user || !intentId) return;
		let active = true;
		void fetch(`/api/billing/actions/${encodeURIComponent(intentId)}`, {
			credentials: "same-origin",
		})
			.then(readData<BillingActionDetails>)
			.then((value) => active && setDetails(value))
			.catch((error: unknown) => {
				if (!active) return;
				setStatus({
					tone: "error",
					message: error instanceof Error ? error.message : "Could not load this billing action.",
				});
			})
			.finally(() => active && setLoaded(true));
		return () => {
			active = false;
		};
	}, [intentId, user]);

	async function execute() {
		if (!intentId) return;
		setBusy(true);
		setStatus(null);
		try {
			const result = await fetch(`/api/billing/actions/${encodeURIComponent(intentId)}/execute`, {
				method: "POST",
				credentials: "same-origin",
			}).then(readData<{ status: string; url?: string | null }>);
			if (result.url) {
				window.location.assign(result.url);
				return;
			}
			setDetails((current) => (current ? { ...current, status: result.status } : current));
			setStatus({ tone: "success", message: "Billing action completed." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not complete this billing action.",
			});
		} finally {
			setBusy(false);
		}
	}

	const copy = details ? ACTION_COPY[details.action] : null;
	const expired = details ? new Date(details.expiresAt).getTime() <= loadedAt : false;
	const completed = details?.status === "completed";

	return (
		<BillingShell
			user={user}
			title="Connected app billing"
			description="Review a billing action requested by an app connected to Passport."
		>
			<StatusBanner status={status} />

			{!loaded ? (
				<Skeleton className="h-64 w-full rounded-xl" />
			) : !details || !copy ? (
				<SettingsCard
					title="Billing action unavailable"
					description="This action is invalid, expired, or belongs to a different Passport account."
				/>
			) : (
				<SettingsCard
					title={copy.title}
					description={copy.description}
					footer={
						<SettingsCardFooter hint={`Requested by ${details.client.name}`}>
							<Badge variant="outline">Expires {new Date(details.expiresAt).toLocaleString()}</Badge>
						</SettingsCardFooter>
					}
				>
					<div className="space-y-5">
						<div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
							<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
								<CreditCard className="size-4 text-muted-foreground" />
							</div>
							<div className="min-w-0">
								<div className="font-medium">{details.target.label}</div>
								<div className="mt-0.5 text-sm text-muted-foreground">
									{details.product
										? details.product.label ?? details.product.name
										: details.subscription
											? `${details.subscription.plan} · ${details.subscription.status}`
											: details.target.type === "organization"
												? "Organization billing account"
												: "Personal billing account"}
								</div>
							</div>
						</div>

						<div className="flex items-start gap-2 text-sm text-muted-foreground">
							<ShieldCheck className="mt-0.5 size-4 shrink-0" />
							<span>
								Passport rechecks your account, the connected app, and billing authority before
								performing this action.
							</span>
						</div>

						<Button
							onClick={() => void execute()}
							disabled={busy || expired || (completed && !details.resultUrl)}
						>
							{busy ? <Loader size="sm" /> : <ArrowRight className="size-4" />}
							{completed && details.resultUrl ? "Continue" : copy.button}
						</Button>
						{expired ? (
							<p className="text-sm text-destructive">This action has expired. Return to the app and request a new one.</p>
						) : null}
					</div>
				</SettingsCard>
			)}
		</BillingShell>
	);
}
