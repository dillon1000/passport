/**
 * Deeplink product page (/billing/product/:productId). Resolves a single plan by
 * its `prod_…` id — including hidden products, which never appear in the public
 * catalog but stay purchasable to anyone who has the link. Unauthenticated
 * visitors are bounced through sign-in via useRequireSession, whose callbackURL
 * returns them straight back here.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { ArrowLeft, CalendarClock, CheckCircle2, EyeOff, Lock, ShoppingCart } from "lucide-react";

import { BillingShell } from "@/components/auth/billing-shell";
import { SettingsCard } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { formatPriceInfo } from "@/lib/billing-groups";
import { queryKeys } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";

import { fetchCatalog, fetchProduct, postSubscriptionAction, requestOneTimeCheckout } from "./api";
import type { CatalogLabels } from "./types";
import { limitEntries, planTitle } from "./utils";

export function Product() {
	const { data: session } = useRequireSession();
	const user = session?.user;
	const { productId } = useParams();

	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<Status | null>(() => {
		const search = new URLSearchParams(window.location.search);
		if (search.get("checkout") === "cancel") return { tone: "error", message: "Checkout canceled." };
		return null;
	});
	const productQuery = useQuery({
		queryKey: queryKeys.product(productId),
		queryFn: async () => {
			if (!productId) throw new Error("Missing product id.");
			const [entry, catalog] = await Promise.all([
				fetchProduct(productId),
				fetchCatalog().catch(() => null),
			]);
			return {
				product: entry,
				labels: {
					entitlementLabels: catalog?.entitlementLabels ?? {},
					limitLabels: catalog?.limitLabels ?? {},
				} satisfies CatalogLabels,
			};
		},
		enabled: Boolean(user && productId),
	});
	const product = productQuery.data?.product ?? null;
	const labels = productQuery.data?.labels ?? { entitlementLabels: {}, limitLabels: {} };
	const loaded = productQuery.isFetched;
	const queryStatus =
		status ??
		(productQuery.error instanceof Error
			? { tone: "error" as const, message: productQuery.error.message }
			: null);

	async function buy() {
		if (!product) return;
		setBusy(true);
		setStatus(null);
		const returnPath = `/billing/product/${encodeURIComponent(productId ?? "")}`;
		try {
			if (product.type === "one_time") {
				const payload = await requestOneTimeCheckout({
					plan: product.name,
					customerType: "user",
					successUrl: "/billing?checkout=success",
					cancelUrl: `${returnPath}?checkout=cancel`,
				});
				if (payload.url) window.location.assign(payload.url);
			} else {
				const payload = await postSubscriptionAction<{ url?: string; redirect?: boolean }>(
					"/subscription/upgrade",
					{
						plan: product.name,
						annual: false,
						customerType: "user",
						successUrl: "/billing?checkout=success",
						cancelUrl: `${returnPath}?checkout=cancel`,
						returnUrl: "/billing",
						disableRedirect: false,
					},
				);
				if (payload.redirect !== false && payload.url) window.location.assign(payload.url);
			}
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not start checkout.",
			});
		} finally {
			setBusy(false);
		}
	}

	const isOneTime = product?.type === "one_time";
	const limits = limitEntries(product?.limits);

	return (
		<BillingShell
			user={user}
			title="Product"
			description="A direct link to a single plan or product."
			subnav={
				<div className="flex items-center py-1">
					<Button variant="ghost" size="sm" asChild>
						<a href="/billing">
							<ArrowLeft className="size-4" />
							Back to billing
						</a>
					</Button>
				</div>
			}
		>
			<StatusBanner status={queryStatus} />

			{!loaded ? (
				<Skeleton className="h-64 w-full rounded-xl" />
			) : !product ? (
				<SettingsCard title="Product not found" description="This link may be expired or invalid.">
					<Button variant="outline" asChild>
						<a href="/billing/plans">Browse plans</a>
					</Button>
				</SettingsCard>
			) : (
				<SettingsCard
					title={planTitle(product, product.name)}
					description={
						`${product.group ? `${product.group} · ` : ""}` +
						(product.description ?? "Plan details")
					}
				>
					<div className="space-y-5">
							{product.price ? (
								<div className="flex items-baseline gap-2">
									<span className="text-3xl font-semibold tabular-nums">
										{formatPriceInfo(product.price)}
									</span>
									{!isOneTime && product.annualPrice ? (
										<span className="text-sm tabular-nums text-muted-foreground">
											or {formatPriceInfo(product.annualPrice)}
										</span>
								) : null}
							</div>
						) : null}

						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="outline">{isOneTime ? "One-time payment" : "Subscription"}</Badge>
							{product.hidden ? (
								<Badge variant="secondary">
									<EyeOff className="mr-1 size-3" />
									Unlisted
								</Badge>
							) : null}
							{product.personalOnly ? (
								<Badge variant="outline">
									<Lock className="mr-1 size-3" />
									Personal only
								</Badge>
							) : null}
							{product.hasFreeTrial ? <Badge variant="outline">Free trial</Badge> : null}
							{!isOneTime && product.hasAnnualDiscount ? (
								<Badge variant="outline">Annual discount</Badge>
							) : null}
						</div>

						{limits.length ? (
							<div>
								<div className="mb-2 text-xs font-medium text-muted-foreground">Limits</div>
								<div className="flex flex-wrap gap-1.5">
									{limits.map(({ key, value }) => (
										<span
											key={key}
											className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
										>
											{`${labels.limitLabels[key]?.name ?? key}: ${value}`}
										</span>
									))}
								</div>
							</div>
						) : null}

						{product.entitlements.length ? (
							<div>
								<div className="mb-2 text-xs font-medium text-muted-foreground">Entitlements</div>
								<div className="flex flex-wrap gap-1.5">
									{product.entitlements.map((entitlement) => (
										<span
											key={entitlement}
											className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground"
										>
											<CheckCircle2 className="size-3" />
											{labels.entitlementLabels[entitlement] ?? entitlement}
										</span>
									))}
								</div>
							</div>
						) : null}

						<div className="flex flex-wrap gap-2 border-t pt-4">
							<Button onClick={() => void buy()} disabled={busy}>
								{isOneTime ? (
									<>
										<ShoppingCart className="size-4" />
										Buy now
									</>
								) : (
									<>
										<CalendarClock className="size-4" />
										Subscribe
									</>
								)}
							</Button>
						</div>
					</div>
				</SettingsCard>
			)}
		</BillingShell>
	);
}
