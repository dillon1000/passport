/**
 * Billing dashboard page. Renders the billing chrome (sub-tab row + customer
 * switcher) and the section matching the current /billing/* route: Overview
 * (subscriptions), Purchases (one-time payments), and Plans (catalog), plus the
 * subscription/plan detail drawers and the admin plan-management workspace. All
 * data and actions come from useBilling; this file stays presentational.
 */
import { useLocation } from "react-router";
import {
	CreditCard,
	ExternalLink,
	Package,
	Plus,
	Receipt,
	RefreshCw,
} from "lucide-react";

import { BillingNav } from "@/components/auth/billing-nav";
import { BillingShell } from "@/components/auth/billing-shell";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner } from "@/components/auth/status";
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
	CustomerSelector,
	EmptyState,
	PlanDrawer,
	PlanGroup,
	PlanWorkspaceDrawer,
	PurchaseRow,
	SubscriptionDrawer,
	SubscriptionRow,
} from "./components";
import { useBilling } from "./use-billing";
import { emptyPlanDraft, planToDraft, PERSONAL_KEY } from "./utils";

export function Billing() {
	const billing = useBilling();
	const {
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
		status,
		expandedGroups,
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
	} = billing;

	// One component mounted under /billing/*; the row-3 sub-tabs are real routes,
	// so the visible section follows the URL while state persists across them.
	const { pathname } = useLocation();
	const section = pathname.endsWith("/plans")
		? "plans"
		: pathname.endsWith("/purchases")
			? "purchases"
			: "overview";

	return (
		<BillingShell
			user={user}
			title="Billing"
			description="Manage subscriptions, plans, and one-time purchases backed by Stripe."
			subnav={
				<div className="flex items-center justify-between gap-3 py-1">
					<BillingNav user={user} />
					<CustomerSelector
						value={selectedCustomerKey}
						organizations={organizations}
						onChange={setSelectedCustomerKey}
					/>
				</div>
			}
		>
			<StatusBanner status={status} />

			{section === "overview" ? (
				<section id="subscriptions" className="scroll-mt-32">
					<SettingsCard
						title="Subscriptions"
						description="Subscription state for the selected customer."
						footer={
							<SettingsCardFooter
								hint={
									selectedCustomerKey === PERSONAL_KEY
										? "Your personal account."
										: `Organization: ${selectedOrganization?.slug ?? selectedCustomerKey}`
								}
							>
								<div className="flex flex-wrap gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() => void refreshSelected()}
										disabled={busy === "refresh"}
									>
										{busy === "refresh" ? (
											<Loader size="sm" />
										) : (
											<RefreshCw className="size-4" />
										)}
										Refresh
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => void openPortal()}
										disabled={!activeSub || busy === "portal"}
									>
										<ExternalLink className="size-4" />
										Portal
									</Button>
								</div>
							</SettingsCardFooter>
						}
					>
						<div className="space-y-4">
							{!loaded ? (
								<div className="space-y-3">
									<Skeleton className="h-20" />
									<Skeleton className="h-20" />
								</div>
							) : subscriptions.length ? (
								<div className="divide-y overflow-hidden rounded-lg border">
									{subscriptions.map((subscription) => (
										<SubscriptionRow
											key={subscription.id}
											subscription={subscription}
											plan={plansByName.get(subscription.plan.toLowerCase())}
											onOpen={() => setOpenSubscription(subscription)}
										/>
									))}
								</div>
							) : (
								<EmptyState
									icon={CreditCard}
									title="No subscriptions"
									body="Pick a plan below to start a subscription for this customer."
								/>
							)}
						</div>
					</SettingsCard>
				</section>
			) : null}

			{section === "purchases" ? (
				<section id="purchases" className="scroll-mt-32">
					<SettingsCard
						title="Purchase history"
						description="One-time payments for the selected customer."
						footer={
							<SettingsCardFooter
								hint={
									loaded ? (
										`${purchases.length} purchase${purchases.length === 1 ? "" : "s"}.`
									) : (
										<Skeleton className="h-3 w-28" />
									)
								}
							/>
						}
					>
						{!loaded ? (
							<div className="space-y-3">
								<Skeleton className="h-16" />
								<Skeleton className="h-16" />
							</div>
						) : purchases.length ? (
							<div className="divide-y overflow-hidden rounded-lg border">
								{purchases.map((purchase) => (
									<PurchaseRow
										key={purchase.id}
										purchase={purchase}
										plan={plansByName.get(purchase.plan.toLowerCase())}
									/>
								))}
							</div>
						) : (
							<EmptyState
								icon={Receipt}
								title="No purchases"
								body="One-time payments for this customer will appear here."
							/>
						)}
					</SettingsCard>
				</section>
			) : null}

			{section === "plans" ? (
				<section id="plans" className="scroll-mt-32">
					<SettingsCard
						title="Plans"
						description="Plans grouped by app. Select a plan to view details or subscribe."
						footer={
							<SettingsCardFooter
								hint={
									loaded ? (
										`${plans.length} plan${plans.length === 1 ? "" : "s"} across ${groupedPlans.length} group${groupedPlans.length === 1 ? "" : "s"}.`
									) : (
										<Skeleton className="h-3 w-24" />
									)
								}
							>
								{isAdmin ? (
									<Button
										size="sm"
										onClick={() => setWorkspace({ id: null, draft: emptyPlanDraft() })}
									>
										<Plus className="size-4" />
										Add plan
									</Button>
								) : null}
							</SettingsCardFooter>
						}
					>
						{!loaded ? (
							<div className="space-y-3">
								<Skeleton className="h-12" />
								<Skeleton className="h-12" />
							</div>
						) : plans.length ? (
							<div className="grid items-start gap-3 lg:grid-cols-2">
								{groupedPlans.map(({ group, plans: groupPlans }) => (
									<PlanGroup
										key={group}
										group={group}
										plans={groupPlans}
										open={expandedGroups.has(group)}
										activePlanName={activeSub?.plan.toLowerCase()}
										onToggle={() => toggleGroup(group)}
										onOpenPlan={(name) => setOpenPlanName(name)}
									/>
								))}
							</div>
						) : (
							<EmptyState
								icon={Package}
								title="No plans configured"
								body={
									isAdmin
										? "Add a plan to expose it to customers."
										: "No billing plans are configured for this deployment."
								}
							/>
						)}
					</SettingsCard>
				</section>
			) : null}

			<SubscriptionDrawer
				subscription={openSubscription}
				plan={openSubscription ? plansByName.get(openSubscription.plan.toLowerCase()) : undefined}
				labels={catalogLabels}
				busy={busy}
				onOpenChange={(open) => !open && setOpenSubscription(null)}
				onPortal={() => void openPortal()}
				onCancel={(subscription) => void cancelSubscription(subscription)}
				onRestore={(subscription) => void restoreSubscription(subscription)}
			/>

			<PlanDrawer
				plan={openPlan}
				adminPlan={openPlanName ? adminPlanByName.get(openPlanName.toLowerCase()) : undefined}
				labels={catalogLabels}
				isCurrent={activeSub?.plan.toLowerCase() === openPlanName?.toLowerCase()}
				isAdmin={isAdmin}
				isOrganization={selectedCustomerKey !== PERSONAL_KEY}
				busy={busy}
				onOpenChange={(open) => !open && setOpenPlanName(null)}
				onCheckout={(annual) => openPlan && void startCheckout(openPlan, annual)}
				onBuy={() => openPlan && void startOneTimeCheckout(openPlan)}
				onEdit={(adminPlan) => {
					setOpenPlanName(null);
					setWorkspace({ id: adminPlan.id, draft: planToDraft(adminPlan) });
				}}
				onDelete={(adminPlan) => setDeleteTarget(adminPlan)}
			/>

			{isAdmin ? (
				<PlanWorkspaceDrawer
					workspace={workspace}
					adminPlans={adminPlans}
					entitlements={entitlements}
					limits={limits}
					oauthClients={oauthClients}
					prices={prices}
					busy={busy === "save-plan"}
					onOpenChange={(open) => !open && setWorkspace(null)}
					onChange={(draft) =>
						setWorkspace((current) => (current ? { ...current, draft } : current))
					}
					onSubmit={savePlan}
					onSelectPlan={(plan) => setWorkspace({ id: plan.id, draft: planToDraft(plan) })}
					onNewPlan={() => setWorkspace({ id: null, draft: emptyPlanDraft() })}
					onReorder={(ids) => void reorderPlans(ids)}
					onCreateRegistry={createRegistryEntry}
					onUpdateRegistry={updateRegistryEntry}
					onDeleteRegistry={deleteRegistryEntry}
				/>
			) : null}

			<Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete plan?</DialogTitle>
						<DialogDescription>
							This removes <span className="font-medium">{deleteTarget?.name}</span> from the
							catalog. Existing subscriptions on Stripe are unaffected, but customers can no
							longer subscribe to it.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button
							variant="destructive"
							onClick={() => deleteTarget && void deletePlan(deleteTarget)}
							disabled={Boolean(deleteTarget && busy === `delete-${deleteTarget.id}`)}
						>
							Delete plan
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</BillingShell>
	);
}
