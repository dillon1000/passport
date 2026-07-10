/**
 * Billing data + actions hook. Owns all per-customer state (subscriptions,
 * purchases, catalog, admin plan registry) and the checkout/portal/cancel and
 * admin CRUD actions. The page and drawers stay presentational and read from
 * the returned object.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { authClient } from "@/auth-client";
import { type Status } from "@/components/auth/status";
import { hasAdminRole } from "@/lib/admin-access";
import type { BillingPlanCatalogEntry } from "@/lib/billing";
import { groupPlansByApp, type PriceInfo } from "@/lib/billing-groups";
import { fetchAPIJSON, queryKeys } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";

import {
	fetchCatalog,
	listPurchases,
	listSubscriptions,
	postSubscriptionAction,
	readJSON,
	requestOneTimeCheckout,
} from "./api";
import {
	activeSubscription,
	PERSONAL_KEY,
	planDraftToPayload,
	planToDraft,
} from "./utils";
import type {
	AdminBillingPlan,
	BillingTarget,
	CatalogLabels,
	EntitlementEntry,
	LimitEntry,
	OAuthClientLite,
	OrganizationSummary,
	PlanDraft,
	PurchaseSummary,
	SubscriptionSummary,
} from "./types";

type BillingAdminData = {
	plans: AdminBillingPlan[];
	entitlements: EntitlementEntry[];
	limits: LimitEntry[];
	oauthClients: OAuthClientLite[];
};

type BillingCustomerData = {
	subscriptions: SubscriptionSummary[];
	purchases: PurchaseSummary[];
};

const EMPTY_CATALOG_PLANS: BillingPlanCatalogEntry[] = [];
const EMPTY_ADMIN_PLANS: AdminBillingPlan[] = [];
const EMPTY_ENTITLEMENTS: EntitlementEntry[] = [];
const EMPTY_LIMITS: LimitEntry[] = [];
const EMPTY_OAUTH_CLIENTS: OAuthClientLite[] = [];
const EMPTY_ORGANIZATIONS: OrganizationSummary[] = [];
const EMPTY_PRICES: Record<string, PriceInfo> = {};
const EMPTY_SUBSCRIPTIONS: SubscriptionSummary[] = [];
const EMPTY_PURCHASES: PurchaseSummary[] = [];

async function fetchBillingAdminData(): Promise<BillingAdminData> {
	const [plansRes, entRes, limitRes, clientRes] = await Promise.all([
		fetch("/api/admin/billing/plans", { credentials: "same-origin" }),
		fetch("/api/admin/billing/entitlements", { credentials: "same-origin" }),
		fetch("/api/admin/billing/limits", { credentials: "same-origin" }),
		fetch("/api/admin/oauth-clients", { credentials: "same-origin" }),
	]);
	return {
		plans: plansRes.ok ? ((await plansRes.json()) as { plans: AdminBillingPlan[] }).plans : [],
		entitlements: entRes.ok ? ((await entRes.json()) as { items: EntitlementEntry[] }).items : [],
		limits: limitRes.ok ? ((await limitRes.json()) as { items: LimitEntry[] }).items : [],
		oauthClients: clientRes.ok
			? ((await clientRes.json()) as { clients: { clientId: string; name: string }[] }).clients.map(
					(client) => ({ clientId: client.clientId, name: client.name }),
				)
			: [],
	};
}

async function fetchOrganizationsForBilling() {
	const result = await authClient.organization.list();
	if (result.error) {
		throw new Error(result.error.message ?? "Could not load organizations.");
	}
	return (result.data ?? []) as OrganizationSummary[];
}

async function fetchBillingCustomer(target: BillingTarget): Promise<BillingCustomerData> {
	const [subscriptions, purchases] = await Promise.all([
		listSubscriptions(target),
		listPurchases(target),
	]);
	return { subscriptions, purchases };
}

async function fetchPrices(ids: readonly string[]) {
	const unique = [...new Set(ids.filter(Boolean))];
	if (!unique.length) return {};
	const payload = await fetchAPIJSON<{ prices: Record<string, PriceInfo> }>(
		`/api/admin/billing/prices?ids=${encodeURIComponent(unique.join(","))}`,
		{ credentials: "same-origin" },
	);
	return payload.prices;
}

function isPriceId(value: string | null | undefined): value is string {
	return Boolean(value);
}

export function useBilling() {
	const { data: session } = useRequireSession();
	const queryClient = useQueryClient();
	const user = session?.user;
	const isAdmin = hasAdminRole(user);

	const [selectedCustomerKey, setSelectedCustomerKey] = useState(PERSONAL_KEY);
	const [busy, setBusy] = useState<string | null>(null);
	const [expandedGroups, setExpandedGroups] = useState<Set<string> | null>(null);

	const [openSubscription, setOpenSubscription] = useState<SubscriptionSummary | null>(null);
	const [openPlanName, setOpenPlanName] = useState<string | null>(null);
	const [workspace, setWorkspace] = useState<{ id: string | null; draft: PlanDraft } | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AdminBillingPlan | null>(null);

	const [status, setStatus] = useState<Status | null>(() => {
		const searchParams = new URLSearchParams(window.location.search);
		if (searchParams.get("checkout") === "success") {
			return { tone: "success", message: "Subscription updated." };
		}
		if (searchParams.get("checkout") === "cancel") {
			return { tone: "error", message: "Checkout canceled." };
		}
		return null;
	});
	const selectedTarget: BillingTarget =
		selectedCustomerKey === PERSONAL_KEY
			? { customerType: "user" }
			: { customerType: "organization", referenceId: selectedCustomerKey };
	const catalogQuery = useQuery({
		queryKey: queryKeys.billingCatalog(),
		queryFn: fetchCatalog,
		enabled: Boolean(user),
	});
	const adminQuery = useQuery({
		queryKey: queryKeys.billingAdmin(),
		queryFn: fetchBillingAdminData,
		enabled: Boolean(user && isAdmin),
	});
	const organizationsQuery = useQuery({
		queryKey: queryKeys.organizations(user?.id),
		queryFn: fetchOrganizationsForBilling,
		enabled: Boolean(user),
	});
	const customerQuery = useQuery({
		queryKey: queryKeys.billingCustomer(selectedTarget),
		queryFn: () => fetchBillingCustomer(selectedTarget),
		enabled: Boolean(user),
	});
	const priceIds = useMemo(
		() =>
			workspace ? (adminQuery.data?.plans ?? []).map((plan) => plan.priceId).filter(isPriceId) : [],
		[adminQuery.data?.plans, workspace],
	);
	const pricesQuery = useQuery({
		queryKey: queryKeys.billingPrices(priceIds),
		queryFn: () => fetchPrices(priceIds),
		enabled: Boolean(workspace && priceIds.length),
	});
	const plans = catalogQuery.data?.plans ?? EMPTY_CATALOG_PLANS;
	const catalogLabels: CatalogLabels = {
		entitlementLabels: catalogQuery.data?.entitlementLabels ?? {},
		limitLabels: catalogQuery.data?.limitLabels ?? {},
	};
	const adminPlans = adminQuery.data?.plans ?? EMPTY_ADMIN_PLANS;
	const entitlements = adminQuery.data?.entitlements ?? EMPTY_ENTITLEMENTS;
	const limits = adminQuery.data?.limits ?? EMPTY_LIMITS;
	const oauthClients = adminQuery.data?.oauthClients ?? EMPTY_OAUTH_CLIENTS;
	const prices = pricesQuery.data ?? EMPTY_PRICES;
	const organizations = organizationsQuery.data ?? EMPTY_ORGANIZATIONS;
	const loaded =
		catalogQuery.isFetched &&
		organizationsQuery.isFetched &&
		customerQuery.isFetched &&
		(!isAdmin || adminQuery.isFetched);
	const queryStatus =
		status ??
		(catalogQuery.error instanceof Error
			? { tone: "error" as const, message: catalogQuery.error.message }
			: organizationsQuery.error instanceof Error
				? { tone: "error" as const, message: organizationsQuery.error.message }
				: customerQuery.error instanceof Error
					? { tone: "error" as const, message: customerQuery.error.message }
					: adminQuery.error instanceof Error
						? { tone: "error" as const, message: adminQuery.error.message }
						: null);

	const plansByName = useMemo(
		() => new Map(plans.map((plan) => [plan.name.toLowerCase(), plan])),
		[plans],
	);
	const adminPlanByName = useMemo(
		() => new Map(adminPlans.map((plan) => [plan.name.toLowerCase(), plan])),
		[adminPlans],
	);
	const groupedPlans = useMemo(() => groupPlansByApp(plans), [plans]);
	const visibleExpandedGroups = useMemo(
		() => expandedGroups ?? new Set(groupedPlans.map((entry) => entry.group)),
		[expandedGroups, groupedPlans],
	);

	const subscriptions = customerQuery.data?.subscriptions ?? EMPTY_SUBSCRIPTIONS;
	const purchases = customerQuery.data?.purchases ?? EMPTY_PURCHASES;
	const activeSub = activeSubscription(subscriptions);
	const openPlan = openPlanName ? plansByName.get(openPlanName.toLowerCase()) : undefined;
	const selectedOrganization = organizations.find(
		(organization) => organization.id === selectedCustomerKey,
	);

	function refreshCatalog() {
		return catalogQuery.refetch();
	}

	function refreshAdminData() {
		return adminQuery.refetch();
	}

	function refreshCustomer() {
		return customerQuery.refetch();
	}

	async function refreshSelected() {
		setBusy("refresh");
		try {
			await Promise.all([refreshCatalog(), refreshCustomer()]);
			if (isAdmin) await refreshAdminData();
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not refresh billing data.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function startCheckout(plan: BillingPlanCatalogEntry, annual: boolean) {
		setBusy(`checkout-${plan.name}-${annual ? "year" : "month"}`);
		setStatus(null);
		try {
			const payload = await postSubscriptionAction<{ url?: string; redirect?: boolean }>(
				"/subscription/upgrade",
				{
					plan: plan.name,
					annual,
					...(selectedTarget.referenceId ? { referenceId: selectedTarget.referenceId } : {}),
					customerType: selectedTarget.customerType,
					...(activeSub?.stripeSubscriptionId
						? { subscriptionId: activeSub.stripeSubscriptionId }
						: {}),
					successUrl: "/billing?checkout=success",
					cancelUrl: "/billing?checkout=cancel",
					returnUrl: "/billing",
					disableRedirect: false,
				},
			);
			if (payload.redirect !== false && payload.url) {
				window.location.assign(payload.url);
				return;
			}
			await refreshCustomer();
			setOpenPlanName(null);
			setStatus({ tone: "success", message: "Subscription updated." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not start checkout.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function startOneTimeCheckout(plan: BillingPlanCatalogEntry) {
		setBusy(`buy-${plan.name}`);
		setStatus(null);
		try {
			const payload = await requestOneTimeCheckout({
				plan: plan.name,
				customerType: selectedTarget.customerType,
				...(selectedTarget.referenceId ? { referenceId: selectedTarget.referenceId } : {}),
				successUrl: "/billing?checkout=success",
				cancelUrl: "/billing?checkout=cancel",
			});
			if (payload.url) {
				window.location.assign(payload.url);
			}
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not start checkout.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function openPortal() {
		setBusy("portal");
		setStatus(null);
		try {
			const payload = await postSubscriptionAction<{ url?: string; redirect?: boolean }>(
				"/subscription/billing-portal",
				{
					...(selectedTarget.referenceId ? { referenceId: selectedTarget.referenceId } : {}),
					customerType: selectedTarget.customerType,
					returnUrl: "/billing",
					disableRedirect: false,
				},
			);
			if (payload.redirect !== false && payload.url) {
				window.location.assign(payload.url);
			}
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not open billing portal.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function cancelSubscription(subscription: SubscriptionSummary) {
		setBusy(`cancel-${subscription.id}`);
		setStatus(null);
		try {
			const payload = await postSubscriptionAction<{ url?: string; redirect?: boolean }>(
				"/subscription/cancel",
				{
					...(selectedTarget.referenceId ? { referenceId: selectedTarget.referenceId } : {}),
					customerType: selectedTarget.customerType,
					...(subscription.stripeSubscriptionId
						? { subscriptionId: subscription.stripeSubscriptionId }
						: {}),
					returnUrl: "/billing",
					disableRedirect: false,
				},
			);
			if (payload.redirect !== false && payload.url) {
				window.location.assign(payload.url);
			}
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not open cancellation.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function restoreSubscription(subscription: SubscriptionSummary) {
		setBusy(`restore-${subscription.id}`);
		setStatus(null);
		try {
			await postSubscriptionAction<unknown>("/subscription/restore", {
				...(selectedTarget.referenceId ? { referenceId: selectedTarget.referenceId } : {}),
				customerType: selectedTarget.customerType,
				...(subscription.stripeSubscriptionId
					? { subscriptionId: subscription.stripeSubscriptionId }
					: {}),
			});
			await refreshCustomer();
			setOpenSubscription(null);
			setStatus({ tone: "success", message: "Subscription restored." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not restore subscription.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function savePlan(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!workspace) return;
		const body = planDraftToPayload(workspace.draft);
		if ("error" in body) {
			setStatus({ tone: "error", message: body.error });
			return;
		}
		setBusy("save-plan");
		setStatus(null);
		try {
			const response = await fetch(
				workspace.id
					? `/api/admin/billing/plans/${encodeURIComponent(workspace.id)}`
					: "/api/admin/billing/plans",
				{
					method: workspace.id ? "PATCH" : "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body.value),
				},
			);
			const saved = await readJSON<{ plan: AdminBillingPlan }>(response);
			await Promise.all([refreshCatalog(), refreshAdminData()]);
			// Keep the workspace open on the saved plan for continued editing.
			setWorkspace({ id: saved.plan.id, draft: planToDraft(saved.plan) });
			setStatus({ tone: "success", message: workspace.id ? "Plan updated." : "Plan created." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not save plan.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function deletePlan(plan: AdminBillingPlan) {
		setBusy(`delete-${plan.id}`);
		setStatus(null);
		try {
			const response = await fetch(`/api/admin/billing/plans/${encodeURIComponent(plan.id)}`, {
				method: "DELETE",
				credentials: "same-origin",
			});
			if (!response.ok && response.status !== 204) await readJSON(response);
			await Promise.all([refreshCatalog(), refreshAdminData()]);
			setDeleteTarget(null);
			setOpenPlanName(null);
			setStatus({ tone: "success", message: "Plan deleted." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not delete plan.",
			});
		} finally {
			setBusy(null);
		}
	}

	async function reorderPlans(orderedIds: string[]) {
		// Optimistic: reflect the new order immediately, then persist.
		setStatus(null);
		queryClient.setQueryData<BillingAdminData>(queryKeys.billingAdmin(), (current) => {
			if (!current) return current;
			const byId = new Map(current.plans.map((plan) => [plan.id, plan]));
			return {
				...current,
				plans: orderedIds.map((id) => byId.get(id)).filter(Boolean) as AdminBillingPlan[],
			};
		});
		try {
			const response = await fetch("/api/admin/billing/plans/reorder", {
				method: "PATCH",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ order: orderedIds }),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Could not reorder billing plans.");
			}
			await refreshCatalog();
			setStatus({ tone: "success", message: "Plan order updated." });
		} catch (error) {
			await refreshAdminData();
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not reorder billing plans.",
			});
		}
	}

	async function createRegistryEntry(
		kind: "entitlements" | "limits",
		input: Record<string, unknown>,
	) {
		const response = await fetch(`/api/admin/billing/${kind}`, {
			method: "POST",
			credentials: "same-origin",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		const payload = await readJSON<{ item: EntitlementEntry | LimitEntry }>(response);
		await refreshAdminData();
		return payload.item;
	}

	async function updateRegistryEntry(
		kind: "entitlements" | "limits",
		id: string,
		input: Record<string, unknown>,
	) {
		const response = await fetch(`/api/admin/billing/${kind}/${encodeURIComponent(id)}`, {
			method: "PATCH",
			credentials: "same-origin",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		const payload = await readJSON<{ item: EntitlementEntry | LimitEntry }>(response);
		await refreshAdminData();
		return payload.item;
	}

	async function deleteRegistryEntry(kind: "entitlements" | "limits", id: string) {
		const response = await fetch(`/api/admin/billing/${kind}/${encodeURIComponent(id)}`, {
			method: "DELETE",
			credentials: "same-origin",
		});
		if (!response.ok && response.status !== 204) await readJSON(response);
		await refreshAdminData();
	}

	function toggleGroup(group: string) {
		setExpandedGroups((current) => {
			const next = new Set(current ?? visibleExpandedGroups);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});
	}

	return {
		user,
		isAdmin,
		plans,
		plansByName,
		groupedPlans,
		catalogLabels,
		adminPlans,
		adminPlanByName,
		entitlements,
		limits,
		oauthClients,
		prices,
		organizations,
		selectedOrganization,
		selectedCustomerKey,
		setSelectedCustomerKey,
		subscriptions,
		purchases,
		activeSub,
		loaded,
		busy,
		status: queryStatus,
		setStatus,
		expandedGroups: visibleExpandedGroups,
		toggleGroup,
		openSubscription,
		setOpenSubscription,
		openPlanName,
		setOpenPlanName,
		openPlan,
		workspace,
		setWorkspace,
		deleteTarget,
		setDeleteTarget,
		refreshSelected,
		startCheckout,
		startOneTimeCheckout,
		openPortal,
		cancelSubscription,
		restoreSubscription,
		savePlan,
		deletePlan,
		reorderPlans,
		createRegistryEntry,
		updateRegistryEntry,
		deleteRegistryEntry,
	};
}
