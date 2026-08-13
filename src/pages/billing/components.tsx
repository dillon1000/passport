/**
 * Presentational components for the billing module: the customer switcher,
 * subscription/purchase rows, the plan catalog group, the subscription and plan
 * detail drawers, and the admin plan-management workspace (sortable list,
 * pricing table, entitlement/limit registry drawers, and the plan editor).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Building2,
	CalendarClock,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Copy,
	CreditCard,
	EyeOff,
	GripVertical,
	HelpCircle,
	Layers,
	Lock,
	Package,
	Pencil,
	Plus,
	Receipt,
	RotateCcw,
	ShoppingCart,
	Trash2,
	UserRound,
	X,
	XCircle,
} from "lucide-react";
import { Select } from "@cloudflare/kumo";

import { Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BillingPlanCatalogEntry } from "@/lib/billing";
import { buildPricingMatrix, formatPriceInfo, type PriceInfo } from "@/lib/billing-groups";
import { cn } from "@/lib/utils";

import type {
	AdminBillingPlan,
	CatalogLabels,
	EntitlementEntry,
	LimitEntry,
	OAuthClientLite,
	OrganizationSummary,
	PlanDraft,
	PurchaseSummary,
	StripeProductDraft,
	SubscriptionSummary,
} from "./types";
import {
	NO_GROUP_VALUE,
	PERSONAL_KEY,
	STATUS_TONE,
	STRIPE_HINTS,
	formatAmount,
	formatDate,
	formatPurchaseAmount,
	limitEntries,
	planTitle,
	statusLabel,
} from "./utils";

export function CustomerSelector({
	value,
	organizations,
	onChange,
}: {
	value: string;
	organizations: OrganizationSummary[];
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex shrink-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			<CustomerChip
				icon={UserRound}
				label="Personal"
				active={value === PERSONAL_KEY}
				onClick={() => onChange(PERSONAL_KEY)}
			/>
			{organizations.map((organization) => (
				<CustomerChip
					key={organization.id}
					icon={Building2}
					label={organization.name}
					active={value === organization.id}
					onClick={() => onChange(organization.id)}
				/>
			))}
		</div>
	);
}

export function CustomerChip({
	icon: Icon,
	label,
	active,
	onClick,
}: {
	icon: typeof UserRound;
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
				onClick={onClick}
				aria-pressed={active}
				className={cn(
					"inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-[scale,background-color,border-color,color] duration-150 ease-out active:scale-[0.96]",
					active
						? "border-foreground/30 bg-background font-medium"
						: "border-transparent text-muted-foreground hover:bg-muted/60",
			)}
		>
			<Icon className="size-3.5" />
			{label}
		</button>
	);
}

export function SubscriptionRow({
	subscription,
	plan,
	onOpen,
}: {
	subscription: SubscriptionSummary;
	plan?: BillingPlanCatalogEntry;
	onOpen: () => void;
}) {
	const pendingChange =
		subscription.cancelAtPeriodEnd === true || Boolean(subscription.stripeScheduleId);
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
		>
			<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
				<CreditCard className="size-[1.1rem]" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="truncate text-sm font-medium">
						{planTitle(plan, subscription.plan)}
					</span>
					<Badge variant={STATUS_TONE[subscription.status] ?? "outline"} className="capitalize">
						{statusLabel(subscription.status)}
					</Badge>
					{pendingChange ? <Badge variant="secondary">Pending change</Badge> : null}
				</div>
				<div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
					{subscription.billingInterval
						? `${subscription.billingInterval} billing`
						: "Billing interval unknown"}
					{subscription.seats ? ` · ${subscription.seats} seats` : ""}
					{subscription.periodEnd ? ` · renews ${formatDate(subscription.periodEnd)}` : ""}
				</div>
			</div>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

// Renders a single one-time payment. Unlike SubscriptionRow this is non-interactive:
// one-time purchases have no recurring state to manage, so there's no drawer to open.
export function PurchaseRow({
	purchase,
	plan,
}: {
	purchase: PurchaseSummary;
	plan?: BillingPlanCatalogEntry;
}) {
	const amount = formatPurchaseAmount(purchase.amountTotal, purchase.currency);
	const purchasedAt = purchase.purchasedAt ?? purchase.createdAt;
	return (
		<div className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
			<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
				<Receipt className="size-[1.1rem]" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="truncate text-sm font-medium">
						{planTitle(plan, purchase.plan)}
					</span>
					<Badge variant={STATUS_TONE[purchase.status] ?? "outline"} className="capitalize">
						{statusLabel(purchase.status)}
					</Badge>
					{purchase.quantity > 1 ? <Badge variant="outline">×{purchase.quantity}</Badge> : null}
				</div>
				<div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
					{purchasedAt ? `Purchased ${formatDate(purchasedAt)}` : "Purchase date unknown"}
				</div>
			</div>
			{amount ? (
				<span className="shrink-0 text-sm font-medium tabular-nums">{amount}</span>
			) : null}
		</div>
	);
}

export function PlanGroup({
	group,
	plans,
	open,
	activePlanName,
	onToggle,
	onOpenPlan,
}: {
	group: string;
	plans: BillingPlanCatalogEntry[];
	open: boolean;
	activePlanName?: string;
	onToggle: () => void;
	onOpenPlan: (name: string) => void;
}) {
	return (
		<div className="overflow-hidden rounded-lg border">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-center gap-2.5 bg-muted/40 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60"
			>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						!open && "-rotate-90",
					)}
				/>
				<Layers className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-sm font-medium">{group}</span>
					<span className="text-xs tabular-nums text-muted-foreground">
						{plans.length} plan{plans.length === 1 ? "" : "s"}
					</span>
			</button>
			{open ? (
				<ul className="divide-y border-t">
					{plans.map((plan) => {
						const current = activePlanName === plan.name.toLowerCase();
						return (
							<li key={plan.name}>
								<button
									type="button"
									onClick={() => onOpenPlan(plan.name)}
									className="flex w-full items-center gap-3 px-3.5 py-2.5 pl-10 text-left transition-colors hover:bg-muted/40"
								>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-medium">
												{planTitle(plan, plan.name)}
											</span>
											{plan.price ? (
												<span className="text-sm font-medium text-muted-foreground">
													{formatPriceInfo(plan.price)}
												</span>
											) : null}
											{current ? (
												<Badge variant="secondary">
													<CheckCircle2 className="mr-1 size-3" />
													Current
												</Badge>
											) : null}
											{plan.type === "one_time" ? (
												<Badge variant="outline">One-time</Badge>
											) : null}
											{plan.personalOnly ? (
												<Badge variant="outline">
													<Lock className="mr-1 size-3" />
													Personal
												</Badge>
											) : null}
											{plan.hasFreeTrial ? <Badge variant="outline">Trial</Badge> : null}
										</div>
										{plan.description ? (
											<div className="mt-0.5 truncate text-xs text-muted-foreground">
												{plan.description}
											</div>
										) : null}
									</div>
									<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</button>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}

export function SubscriptionDrawer({
	subscription,
	plan,
	labels,
	busy,
	onOpenChange,
	onPortal,
	onCancel,
	onRestore,
}: {
	subscription: SubscriptionSummary | null;
	plan?: BillingPlanCatalogEntry;
	labels: CatalogLabels;
	busy: string | null;
	onOpenChange: (open: boolean) => void;
	onPortal: () => void;
	onCancel: (subscription: SubscriptionSummary) => void;
	onRestore: (subscription: SubscriptionSummary) => void;
}) {
	const pendingChange =
		subscription?.cancelAtPeriodEnd === true || Boolean(subscription?.stripeScheduleId);
	const limits = limitEntries(plan?.limits ?? subscription?.limits);
	return (
		<Sheet open={Boolean(subscription)} onOpenChange={onOpenChange}>
			<SheetContent>
				{subscription ? (
					<>
						<SheetHeader>
							<SheetTitle>{planTitle(plan, subscription.plan)}</SheetTitle>
							<SheetDescription>
								{subscription.billingInterval
									? `${subscription.billingInterval} billing`
									: "Subscription details"}
							</SheetDescription>
						</SheetHeader>
						<SheetBody className="space-y-5">
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									variant={STATUS_TONE[subscription.status] ?? "outline"}
									className="capitalize"
								>
									{statusLabel(subscription.status)}
								</Badge>
								{pendingChange ? <Badge variant="secondary">Pending change</Badge> : null}
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<DrawerMetric label="Current period ends" value={formatDate(subscription.periodEnd)} />
								<DrawerMetric label="Trial ends" value={formatDate(subscription.trialEnd)} />
								{subscription.seats ? (
									<DrawerMetric label="Seats" value={String(subscription.seats)} />
								) : null}
								{subscription.canceledAt ? (
									<DrawerMetric label="Canceled" value={formatDate(subscription.canceledAt)} />
								) : null}
							</div>

							{limits.length ? (
								<div>
									<div className="mb-2 text-xs font-medium text-muted-foreground">Limits</div>
									<div className="flex flex-wrap gap-1.5">
										{limits.map(({ key, value }) => (
											<Chip key={key}>{`${labels.limitLabels[key]?.name ?? key}: ${value}`}</Chip>
										))}
									</div>
								</div>
							) : null}

							{plan?.entitlements.length ? (
								<div>
									<div className="mb-2 text-xs font-medium text-muted-foreground">Entitlements</div>
									<div className="flex flex-wrap gap-1.5">
										{plan.entitlements.map((entitlement) => (
											<Chip key={entitlement} variant="outline">
												{labels.entitlementLabels[entitlement] ?? entitlement}
											</Chip>
										))}
									</div>
								</div>
							) : null}
						</SheetBody>
						<SheetFooterRow>
							<Button variant="outline" onClick={onPortal} disabled={busy === "portal"}>
								<CreditCard className="size-4" />
								Manage in portal
							</Button>
							{pendingChange ? (
								<Button
									onClick={() => onRestore(subscription)}
									disabled={busy === `restore-${subscription.id}`}
								>
									<RotateCcw className="size-4" />
									Restore
								</Button>
							) : (
								<Button
									variant="destructive"
									onClick={() => onCancel(subscription)}
									disabled={busy === `cancel-${subscription.id}`}
								>
									<XCircle className="size-4" />
									Cancel
								</Button>
							)}
						</SheetFooterRow>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

export function PlanDrawer({
	plan,
	adminPlan,
	labels,
	isCurrent,
	isAdmin,
	isOrganization,
	busy,
	onOpenChange,
	onCheckout,
	onBuy,
	onEdit,
	onDelete,
}: {
	plan?: BillingPlanCatalogEntry;
	adminPlan?: AdminBillingPlan;
	labels: CatalogLabels;
	isCurrent: boolean;
	isAdmin: boolean;
	isOrganization: boolean;
	busy: string | null;
	onOpenChange: (open: boolean) => void;
	onCheckout: (annual: boolean) => void;
	onBuy: () => void;
	onEdit: (adminPlan: AdminBillingPlan) => void;
	onDelete: (adminPlan: AdminBillingPlan) => void;
}) {
	const limits = limitEntries(plan?.limits);
	const isOneTime = plan?.type === "one_time";
	const blockedForOrg = Boolean(plan?.personalOnly && isOrganization);
	return (
		<Sheet open={Boolean(plan)} onOpenChange={onOpenChange}>
			<SheetContent>
				{plan ? (
					<>
						<SheetHeader>
							<SheetTitle>{planTitle(plan, plan.name)}</SheetTitle>
							<SheetDescription>
								{plan.group ? `${plan.group} · ` : ""}
								{plan.description ?? "Plan details"}
							</SheetDescription>
						</SheetHeader>
						<SheetBody className="space-y-5">
							{plan.price ? (
								<div className="flex items-baseline gap-2">
									<span className="text-2xl font-semibold tabular-nums">
										{formatPriceInfo(plan.price)}
									</span>
									{!isOneTime && plan.annualPrice ? (
										<span className="text-sm tabular-nums text-muted-foreground">
											or {formatPriceInfo(plan.annualPrice)}
										</span>
									) : null}
								</div>
							) : null}

							<div className="flex flex-wrap items-center gap-2">
								{isCurrent ? (
									<Badge variant="secondary">
										<CheckCircle2 className="mr-1 size-3" />
										Current plan
									</Badge>
								) : null}
								<Badge variant="outline">
									{isOneTime ? "One-time payment" : "Subscription"}
								</Badge>
								{plan.personalOnly ? (
									<Badge variant="outline">
										<Lock className="mr-1 size-3" />
										Personal only
									</Badge>
								) : null}
								{plan.hasFreeTrial ? <Badge variant="outline">Free trial</Badge> : null}
								{!isOneTime && plan.hasAnnualDiscount ? (
									<Badge variant="outline">Annual discount</Badge>
								) : null}
							</div>

							{blockedForOrg ? (
								<p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
									This product can only be purchased by a personal account. Switch the customer to
									Personal to continue.
								</p>
							) : null}

							{limits.length ? (
								<div>
									<div className="mb-2 text-xs font-medium text-muted-foreground">Limits</div>
									<div className="flex flex-wrap gap-1.5">
										{limits.map(({ key, value }) => (
											<Chip key={key}>{`${labels.limitLabels[key]?.name ?? key}: ${value}`}</Chip>
										))}
									</div>
								</div>
							) : null}

							{plan.entitlements.length ? (
								<div>
									<div className="mb-2 text-xs font-medium text-muted-foreground">Entitlements</div>
									<div className="flex flex-wrap gap-1.5">
										{plan.entitlements.map((entitlement) => (
											<Chip key={entitlement} variant="outline">
												{labels.entitlementLabels[entitlement] ?? entitlement}
											</Chip>
										))}
									</div>
								</div>
							) : null}
						</SheetBody>
						<SheetFooterRow>
							{isAdmin && adminPlan ? (
								<>
									<Button
										variant="outline"
										className="text-muted-foreground hover:text-destructive"
										onClick={() => onDelete(adminPlan)}
										disabled={busy === `delete-${adminPlan.id}`}
									>
										<Trash2 className="size-4" />
										Delete
									</Button>
									<Button variant="outline" onClick={() => onEdit(adminPlan)}>
										<Pencil className="size-4" />
										Edit
									</Button>
								</>
							) : null}
							{isOneTime ? (
								<Button
									onClick={onBuy}
									disabled={blockedForOrg || busy === `buy-${plan.name}`}
								>
									<ShoppingCart className="size-4" />
									Buy now
								</Button>
							) : (
								<>
									<Button
										onClick={() => onCheckout(false)}
										disabled={blockedForOrg || busy === `checkout-${plan.name}-month`}
									>
										<CalendarClock className="size-4" />
										Subscribe monthly
									</Button>
									{plan.hasAnnualDiscount ? (
										<Button
											variant="outline"
											onClick={() => onCheckout(true)}
											disabled={blockedForOrg || busy === `checkout-${plan.name}-year`}
										>
											Annual
										</Button>
									) : null}
								</>
							)}
						</SheetFooterRow>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

// Native select styled to match the plain <select> used elsewhere in the editor.
const NATIVE_SELECT_CLASS =
	"h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30";

/**
 * Editor for provisioning a brand-new Stripe Product + Price(s) on plan create.
 * Surfaces the practical product and price fields; recurring, annual, and
 * per-seat inputs are hidden for one-time products.
 */
export function StripeProductFields({
	draft,
	oneTime,
	onPatch,
}: {
	draft: StripeProductDraft;
	oneTime: boolean;
	onPatch: (patch: Partial<StripeProductDraft>) => void;
}) {
	return (
		<div className="space-y-4 rounded-lg border border-dashed p-4">
			<p className="text-xs text-muted-foreground">
				Saved as a new Stripe product and price. The resulting price ids are stored on
				this plan.
			</p>

			<Field label="Product name" hint="Defaults to the display label or plan key.">
				<FieldInput
					value={draft.productName}
					onChange={(event) => onPatch({ productName: event.target.value })}
					placeholder="Pro"
				/>
			</Field>

			<div className="grid gap-4 sm:grid-cols-3">
				<Field label={oneTime ? "Price" : "Monthly price"} hint="In major units, e.g. 29.99.">
					<FieldInput
						type="number"
						min={0}
						step="0.01"
						value={draft.amount}
						onChange={(event) => onPatch({ amount: event.target.value })}
						placeholder="29.00"
						required
					/>
				</Field>
				<Field label="Currency">
					<FieldInput
						value={draft.currency}
						onChange={(event) => onPatch({ currency: event.target.value })}
						placeholder="usd"
						required
					/>
				</Field>
				<Field label="Tax behavior">
					<select
						className={NATIVE_SELECT_CLASS}
						value={draft.taxBehavior}
						onChange={(event) =>
							onPatch({ taxBehavior: event.target.value as StripeProductDraft["taxBehavior"] })
						}
					>
						<option value="">Default</option>
						<option value="unspecified">unspecified</option>
						<option value="inclusive">inclusive</option>
						<option value="exclusive">exclusive</option>
					</select>
				</Field>
			</div>

			{oneTime ? null : (
				<div className="grid gap-4 sm:grid-cols-3">
					<Field label="Billing period">
						<select
							className={NATIVE_SELECT_CLASS}
							value={draft.interval}
							onChange={(event) =>
								onPatch({ interval: event.target.value as StripeProductDraft["interval"] })
							}
						>
							<option value="day">day</option>
							<option value="week">week</option>
							<option value="month">month</option>
							<option value="year">year</option>
						</select>
					</Field>
					<Field label="Period count" hint="e.g. 3 for every 3 months.">
						<FieldInput
							type="number"
							min={1}
							value={draft.intervalCount}
							onChange={(event) => onPatch({ intervalCount: event.target.value })}
							placeholder="1"
						/>
					</Field>
					<Field label="Usage type">
						<select
							className={NATIVE_SELECT_CLASS}
							value={draft.usageType}
							onChange={(event) =>
								onPatch({ usageType: event.target.value as StripeProductDraft["usageType"] })
							}
						>
							<option value="">licensed (default)</option>
							<option value="licensed">licensed</option>
							<option value="metered">metered</option>
						</select>
					</Field>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Price nickname">
					<FieldInput
						value={draft.nickname}
						onChange={(event) => onPatch({ nickname: event.target.value })}
						placeholder="Pro monthly"
					/>
				</Field>
				<Field label="Lookup key">
					<FieldInput
						value={draft.lookupKey}
						onChange={(event) => onPatch({ lookupKey: event.target.value })}
						placeholder="pro_monthly"
					/>
				</Field>
			</div>

			{oneTime ? null : (
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Annual price" hint="Optional second yearly price.">
						<FieldInput
							type="number"
							min={0}
							step="0.01"
							value={draft.annualAmount}
							onChange={(event) => onPatch({ annualAmount: event.target.value })}
							placeholder="290.00"
						/>
					</Field>
					<Field label="Annual lookup key">
						<FieldInput
							value={draft.annualLookupKey}
							onChange={(event) => onPatch({ annualLookupKey: event.target.value })}
							placeholder="pro_yearly"
						/>
					</Field>
					<Field label="Seat price" hint="Optional per-seat recurring price.">
						<FieldInput
							type="number"
							min={0}
							step="0.01"
							value={draft.seatAmount}
							onChange={(event) => onPatch({ seatAmount: event.target.value })}
							placeholder="10.00"
						/>
					</Field>
					<Field label="Seat lookup key">
						<FieldInput
							value={draft.seatLookupKey}
							onChange={(event) => onPatch({ seatLookupKey: event.target.value })}
							placeholder="pro_seat"
						/>
					</Field>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Statement descriptor" hint="Shown on customers' card statements.">
					<FieldInput
						value={draft.statementDescriptor}
						onChange={(event) => onPatch({ statementDescriptor: event.target.value })}
						placeholder="ACME PRO"
					/>
				</Field>
				<Field label="Unit label" hint="e.g. seat, credit.">
					<FieldInput
						value={draft.unitLabel}
						onChange={(event) => onPatch({ unitLabel: event.target.value })}
						placeholder="seat"
					/>
				</Field>
				<Field label="Tax code" hint="Stripe tax code, e.g. txcd_10000000.">
					<FieldInput
						value={draft.taxCode}
						onChange={(event) => onPatch({ taxCode: event.target.value })}
						placeholder="txcd_10000000"
					/>
				</Field>
				<Field label="Product URL">
					<FieldInput
						value={draft.url}
						onChange={(event) => onPatch({ url: event.target.value })}
						placeholder="https://example.com/pro"
					/>
				</Field>
			</div>
		</div>
	);
}

export function PlanWorkspaceDrawer({
	workspace,
	adminPlans,
	entitlements,
	limits,
	oauthClients,
	prices,
	busy,
	onOpenChange,
	onChange,
	onSubmit,
	onSelectPlan,
	onNewPlan,
	onReorder,
	onCreateRegistry,
	onUpdateRegistry,
	onDeleteRegistry,
}: {
	workspace: { id: string | null; draft: PlanDraft } | null;
	adminPlans: AdminBillingPlan[];
	entitlements: EntitlementEntry[];
	limits: LimitEntry[];
	oauthClients: OAuthClientLite[];
	prices: Record<string, PriceInfo>;
	busy: boolean;
	onOpenChange: (open: boolean) => void;
	onChange: (draft: PlanDraft) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onSelectPlan: (plan: AdminBillingPlan) => void;
	onNewPlan: () => void;
	onReorder: (ids: string[]) => void;
	onCreateRegistry: (
		kind: "entitlements" | "limits",
		input: Record<string, unknown>,
	) => Promise<EntitlementEntry | LimitEntry>;
	onUpdateRegistry: (
		kind: "entitlements" | "limits",
		id: string,
		input: Record<string, unknown>,
	) => Promise<EntitlementEntry | LimitEntry>;
	onDeleteRegistry: (kind: "entitlements" | "limits", id: string) => Promise<void>;
}) {
	const draft = workspace?.draft;
	const [entDrawerOpen, setEntDrawerOpen] = useState(false);
	const [limitDrawerOpen, setLimitDrawerOpen] = useState(false);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const set = (patch: Partial<PlanDraft>) => draft && onChange({ ...draft, ...patch });

	const entitlementLabels = useMemo(
		() => Object.fromEntries(entitlements.map((entry) => [entry.key, entry.name])),
		[entitlements],
	);
	const limitLabels = useMemo(
		() =>
			Object.fromEntries(
				limits.map((entry) => [entry.key, { name: entry.name, ...(entry.unit ? { unit: entry.unit } : {}) }]),
			),
		[limits],
	);

	// Pricing table compares plans in the draft's group (or all when ungrouped).
	const draftGroup = draft?.group ?? null;
	const groupPlans = useMemo(() => {
		if (!draftGroup) return adminPlans;
		return adminPlans.filter((plan) => (plan.group ?? "") === draftGroup);
	}, [adminPlans, draftGroup]);
	const matrix = useMemo(
		() => buildPricingMatrix(groupPlans, { entitlementLabels, limitLabels }, prices),
		[groupPlans, entitlementLabels, limitLabels, prices],
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const ids = adminPlans.map((plan) => plan.id);
		const oldIndex = ids.indexOf(String(active.id));
		const newIndex = ids.indexOf(String(over.id));
		if (oldIndex === -1 || newIndex === -1) return;
		onReorder(arrayMove(ids, oldIndex, newIndex));
	}

	return (
		<Sheet open={Boolean(workspace)} onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-[68rem]" pushed={entDrawerOpen || limitDrawerOpen}>
				{draft ? (
					<form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
						<SheetHeader>
							<SheetTitle>{workspace?.id ? "Manage plans" : "Add plan"}</SheetTitle>
							<SheetDescription>
								Current plans and pricing on the left, the plan editor on the right.
							</SheetDescription>
						</SheetHeader>

						<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1.05fr_1fr]">
							{/* Left: sortable plans + live pricing table */}
							<div className="flex min-h-0 flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r">
								<div className="flex items-center justify-between px-5 py-3">
									<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
										<GripVertical className="size-3.5" /> Drag to reorder · click to edit
									</span>
									<Button type="button" size="sm" variant="outline" onClick={onNewPlan}>
										<Plus className="size-4" />
										New
									</Button>
								</div>
								<div className="px-5">
									{adminPlans.length ? (
										<DndContext
											sensors={sensors}
											collisionDetection={closestCenter}
											onDragEnd={handleDragEnd}
										>
											<SortableContext
												items={adminPlans.map((plan) => plan.id)}
												strategy={verticalListSortingStrategy}
											>
												<div className="space-y-1.5">
													{adminPlans.map((plan) => (
														<SortablePlanItem
															key={plan.id}
															plan={plan}
															price={plan.priceId ? prices[plan.priceId] : undefined}
															active={workspace?.id === plan.id}
															onSelect={() => onSelectPlan(plan)}
														/>
													))}
												</div>
											</SortableContext>
										</DndContext>
									) : (
										<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
											No plans yet. Fill in the editor and save to create the first one.
										</p>
									)}
								</div>

								{matrix.columns.length ? (
									<div className="mt-4 px-5 pb-5">
										<div className="mb-2 text-xs font-medium text-muted-foreground">
											Pricing table{draft.group ? ` · ${draft.group}` : ""}
										</div>
										<PricingTable matrix={matrix} />
									</div>
								) : null}
							</div>

							{/* Right: plan editor */}
							<div className="flex min-h-0 flex-col overflow-y-auto">
								<div className="space-y-4 px-5 py-4">
									<div className="grid gap-4 sm:grid-cols-2">
										<Field label="Plan key" hint="Lowercase identifier, e.g. pro.">
											<FieldInput
												value={draft.name}
												onChange={(event) => set({ name: event.target.value })}
												placeholder="pro"
												required
											/>
										</Field>
										<Field label="Display label">
											<FieldInput
												value={draft.label}
												onChange={(event) => set({ label: event.target.value })}
												placeholder="Pro"
											/>
										</Field>
									</div>

									<Field
										label="App"
										hint="Sourced from your OAuth clients. Renaming a client won't rewrite saved plans."
									>
										<Select value={draft.group || NO_GROUP_VALUE} placeholder="Select an app" onValueChange={(value) => set({ group: value === NO_GROUP_VALUE ? "" : value ?? "" })} items={[
											{ value: NO_GROUP_VALUE, label: "No app (Other)" },
											...oauthClients.map((client) => ({ value: client.name, label: client.name })),
											...(draft.group && !oauthClients.some((client) => client.name === draft.group) ? [{ value: draft.group, label: draft.group }] : []),
										]} />
									</Field>

									<Field label="Description">
										<FieldTextarea
											value={draft.description}
											onChange={(event) => set({ description: event.target.value })}
											placeholder="For growing teams"
										/>
									</Field>

									<div className="grid gap-4 sm:grid-cols-2">
										<Field label="Billing type">
											<Select value={draft.type} onValueChange={(value) => set({ type: value === "one_time" ? "one_time" : "subscription" })} items={{ subscription: "Subscription", one_time: "One-time payment" }} />
										</Field>
										<label className="flex cursor-pointer items-start gap-2.5 self-end rounded-lg border px-3 py-2.5">
											<Checkbox
												checked={draft.personalOnly}
												onCheckedChange={(checked) => set({ personalOnly: checked === true })}
											/>
											<span className="min-w-0">
												<span className="block text-sm">Personal accounts only</span>
												<span className="block text-xs text-muted-foreground">
													Organizations can't purchase this plan.
												</span>
											</span>
										</label>
										<label className="flex cursor-pointer items-start gap-2.5 self-end rounded-lg border px-3 py-2.5">
											<Checkbox
												checked={draft.hidden}
												onCheckedChange={(checked) => set({ hidden: checked === true })}
											/>
											<span className="min-w-0">
												<span className="block text-sm">Hidden (unlisted)</span>
												<span className="block text-xs text-muted-foreground">
													Excluded from the catalog. Still purchasable via its direct link.
												</span>
											</span>
										</label>
									</div>

									{workspace?.id ? <DeeplinkField id={workspace.id} /> : null}

									{/* Stripe provisioning is offered on create only. */}
									{!workspace?.id ? (
										<label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5">
											<Checkbox
												checked={draft.stripe.enabled}
												onCheckedChange={(checked) =>
													set({ stripe: { ...draft.stripe, enabled: checked === true } })
												}
											/>
											<span className="min-w-0">
												<span className="block text-sm">Create a new product in Stripe</span>
												<span className="block text-xs text-muted-foreground">
													Provisions the Stripe product and price(s) on save using your API
													key. Leave off to reference existing price ids.
												</span>
											</span>
										</label>
									) : null}

									{draft.stripe.enabled && !workspace?.id ? (
										<StripeProductFields
											draft={draft.stripe}
											oneTime={draft.type === "one_time"}
											onPatch={(patch) => set({ stripe: { ...draft.stripe, ...patch } })}
										/>
									) : (
										<>
											<div className="grid gap-4 sm:grid-cols-2">
												<Field
													label={
														<StripeLabel field="priceId">
															{draft.type === "one_time" ? "Price ID" : "Monthly price ID"}
														</StripeLabel>
													}
												>
													<FieldInput
														value={draft.priceId}
														onChange={(event) => set({ priceId: event.target.value })}
														placeholder="price_123"
													/>
												</Field>
												<Field label={<StripeLabel field="lookupKey">Lookup key</StripeLabel>}>
													<FieldInput
														value={draft.lookupKey}
														onChange={(event) => set({ lookupKey: event.target.value })}
														placeholder="pro_monthly"
													/>
												</Field>
											</div>

											{draft.type === "one_time" ? null : (
												<div className="grid gap-4 sm:grid-cols-2">
													<Field
														label={
															<StripeLabel field="annualDiscountPriceId">
																Annual price ID
															</StripeLabel>
														}
													>
														<FieldInput
															value={draft.annualDiscountPriceId}
															onChange={(event) =>
																set({ annualDiscountPriceId: event.target.value })
															}
															placeholder="price_456"
														/>
													</Field>
													<Field
														label={<StripeLabel field="seatPriceId">Seat price ID</StripeLabel>}
													>
														<FieldInput
															value={draft.seatPriceId}
															onChange={(event) => set({ seatPriceId: event.target.value })}
															placeholder="price_seat"
														/>
													</Field>
												</div>
											)}
										</>
									)}

									{draft.type === "one_time" ? null : (
										<div className="grid gap-4 sm:grid-cols-2">
											<Field label="Proration behavior">
												<select
													className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
													value={draft.prorationBehavior}
													onChange={(event) => set({ prorationBehavior: event.target.value })}
												>
													<option value="">Default</option>
													<option value="create_prorations">create_prorations</option>
													<option value="always_invoice">always_invoice</option>
													<option value="none">none</option>
												</select>
											</Field>
											<Field label="Free trial days">
												<FieldInput
													type="number"
													min={0}
													value={draft.freeTrialDays}
													onChange={(event) => set({ freeTrialDays: event.target.value })}
													placeholder="14"
												/>
											</Field>
										</div>
									)}

									<div className="flex flex-wrap gap-2">
											<Button type="button" variant="outline" onClick={() => setEntDrawerOpen(true)}>
												<Plus className="size-4" />
												Entitlements <span className="tabular-nums">({draft.entitlements.length})</span>
											</Button>
											<Button type="button" variant="outline" onClick={() => setLimitDrawerOpen(true)}>
												<Plus className="size-4" />
												Limits <span className="tabular-nums">({Object.keys(draft.limits).length})</span>
											</Button>
									</div>

									{draft.entitlements.length ? (
										<div className="flex flex-wrap gap-1.5">
											{draft.entitlements.map((key) => (
												<Chip key={key} variant="outline">
													{entitlementLabels[key] ?? key}
												</Chip>
											))}
										</div>
									) : null}
								</div>
							</div>
						</div>

						<SheetFooterRow>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Close
							</Button>
							<Button type="submit" disabled={busy}>
								{workspace?.id ? null : <Plus className="size-4" />}
								{workspace?.id ? "Save plan" : "Create plan"}
							</Button>
						</SheetFooterRow>

						<EntitlementsDrawer
							open={entDrawerOpen}
							onOpenChange={setEntDrawerOpen}
							entitlements={entitlements}
							selected={draft.entitlements}
							onToggle={(key, on) =>
								set({
									entitlements: on
										? [...draft.entitlements, key]
										: draft.entitlements.filter((entry) => entry !== key),
								})
							}
							onCreate={(input) => onCreateRegistry("entitlements", input)}
							onUpdate={(id, input) => onUpdateRegistry("entitlements", id, input)}
							onDelete={async (id, key) => {
								await onDeleteRegistry("entitlements", id);
								set({
									entitlements: draft.entitlements.filter((entry) => entry !== key),
								});
							}}
						/>
						<LimitsDrawer
							open={limitDrawerOpen}
							onOpenChange={setLimitDrawerOpen}
							limits={limits}
							values={draft.limits}
							onToggle={(key, on) => {
								const next = { ...draft.limits };
								if (on) next[key] = next[key] ?? "";
								else delete next[key];
								set({ limits: next });
							}}
							onValue={(key, value) => set({ limits: { ...draft.limits, [key]: value } })}
							onCreate={(input) => onCreateRegistry("limits", input)}
							onUpdate={(id, input) => onUpdateRegistry("limits", id, input)}
							onDelete={async (id, key) => {
								await onDeleteRegistry("limits", id);
								const next = { ...draft.limits };
								delete next[key];
								set({ limits: next });
							}}
						/>
					</form>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

export function SortablePlanItem({
	plan,
	price,
	active,
	onSelect,
}: {
	plan: AdminBillingPlan;
	price?: PriceInfo;
	active: boolean;
	onSelect: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: plan.id,
	});
	const style = { transform: CSS.Transform.toString(transform), transition };
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 rounded-lg border px-2.5 py-2",
				active ? "border-foreground/30 bg-muted/60" : "bg-background",
				isDragging && "opacity-60",
			)}
		>
			<button
				type="button"
				className="cursor-grab text-muted-foreground active:cursor-grabbing"
				aria-label="Drag to reorder"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>
			<button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
				<span className="truncate text-sm font-medium">{plan.label ?? plan.name}</span>
				{plan.hidden ? (
					<Badge variant="secondary" className="shrink-0">
						<EyeOff className="mr-1 size-3" />
						Hidden
					</Badge>
				) : null}
				{plan.group ? (
					<span className="truncate text-xs text-muted-foreground">{plan.group}</span>
				) : null}
			</button>
			<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
				{plan.priceId && price ? formatAmount(price) : "—"}
			</span>
		</div>
	);
}

export function PricingTable({ matrix }: { matrix: ReturnType<typeof buildPricingMatrix> }) {
	return (
		<div className="overflow-x-auto rounded-lg border">
			<table className="w-full border-collapse text-xs">
				<thead>
					<tr className="border-b bg-muted/40">
						<th className="px-2.5 py-2 text-left font-medium text-muted-foreground"> </th>
						{matrix.columns.map((column) => (
							<th key={column.name} className="px-2.5 py-2 text-center font-medium">
								<div>{column.label}</div>
									<div className="text-[0.6875rem] font-normal tabular-nums text-muted-foreground">
										{column.price}
									</div>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{matrix.rows.map((row) => (
						<tr key={row.key} className="border-b last:border-0">
							<td className="px-2.5 py-1.5 text-muted-foreground">{row.label}</td>
								{row.cells.map((cell, index) => (
									<td key={index} className="px-2.5 py-1.5 text-center">
										{cell === true ? (
											<Check className="mx-auto size-3.5 text-foreground" />
										) : cell === false ? (
										<span className="text-muted-foreground">—</span>
									) : (
										<span>{cell}</span>
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function EntitlementsDrawer({
	open,
	onOpenChange,
	entitlements,
	selected,
	onToggle,
	onCreate,
	onUpdate,
	onDelete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entitlements: EntitlementEntry[];
	selected: string[];
	onToggle: (key: string, on: boolean) => void;
	onCreate: (input: Record<string, unknown>) => Promise<EntitlementEntry | LimitEntry>;
	onUpdate: (id: string, input: Record<string, unknown>) => Promise<EntitlementEntry | LimitEntry>;
	onDelete: (id: string, key: string) => Promise<void>;
}) {
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [creating, setCreating] = useState(false);

	async function create() {
		if (!name.trim() || !key.trim()) return;
		setCreating(true);
		try {
			const created = await onCreate({ key: key.trim(), name: name.trim() });
			onToggle(created.key, true);
			setName("");
			setKey("");
		} finally {
			setCreating(false);
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Entitlements</SheetTitle>
					<SheetDescription>
						Reusable across plans. Toggle the features this plan grants, edit a definition, or add
						a new one.
					</SheetDescription>
				</SheetHeader>
				<SheetBody className="space-y-4">
					{entitlements.length ? (
						<div className="space-y-1.5">
							{entitlements.map((entry) => (
								<RegistryManageRow
									key={entry.id}
									checked={selected.includes(entry.key)}
									entryKey={entry.key}
									name={entry.name}
									onToggle={(on) => onToggle(entry.key, on)}
									onSave={async (next) => {
										const updated = await onUpdate(entry.id, next);
										if (next.key !== entry.key && selected.includes(entry.key)) {
											onToggle(entry.key, false);
											onToggle(updated.key, true);
										}
									}}
									onDelete={() => onDelete(entry.id, entry.key)}
								/>
							))}
						</div>
					) : (
						<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							No entitlements yet — create the first below.
						</p>
					)}
					<RegistryCreateRow
						creating={creating}
						fields={[
							{ value: name, onChange: setName, placeholder: "Advanced reports" },
							{ value: key, onChange: setKey, placeholder: "advanced_reports", mono: true },
						]}
						onCreate={() => void create()}
					/>
				</SheetBody>
				<SheetFooterRow>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Done
					</Button>
				</SheetFooterRow>
			</SheetContent>
		</Sheet>
	);
}

export function LimitsDrawer({
	open,
	onOpenChange,
	limits,
	values,
	onToggle,
	onValue,
	onCreate,
	onUpdate,
	onDelete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	limits: LimitEntry[];
	values: Record<string, string>;
	onToggle: (key: string, on: boolean) => void;
	onValue: (key: string, value: string) => void;
	onCreate: (input: Record<string, unknown>) => Promise<EntitlementEntry | LimitEntry>;
	onUpdate: (id: string, input: Record<string, unknown>) => Promise<EntitlementEntry | LimitEntry>;
	onDelete: (id: string, key: string) => Promise<void>;
}) {
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [unit, setUnit] = useState("");
	const [creating, setCreating] = useState(false);

	async function create() {
		if (!name.trim() || !key.trim()) return;
		setCreating(true);
		try {
			const created = await onCreate({
				key: key.trim(),
				name: name.trim(),
				...(unit.trim() ? { unit: unit.trim() } : {}),
			});
			onToggle(created.key, true);
			setName("");
			setKey("");
			setUnit("");
		} finally {
			setCreating(false);
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Limits</SheetTitle>
					<SheetDescription>
						Reusable across plans. Enable a limit and set its value, edit a definition, or add a new
						one.
					</SheetDescription>
				</SheetHeader>
				<SheetBody className="space-y-4">
					<div className="space-y-1.5">
						{limits.length ? (
							limits.map((entry) => (
								<RegistryManageRow
									key={entry.id}
									checked={entry.key in values}
									entryKey={entry.key}
									name={entry.name}
									unit={entry.unit}
									value={values[entry.key] ?? ""}
									onToggle={(on) => onToggle(entry.key, on)}
									onValue={(value) => onValue(entry.key, value)}
									onSave={async (next) => {
										const updated = await onUpdate(entry.id, next);
										if (next.key !== entry.key && entry.key in values) {
											const current = values[entry.key] ?? "";
											onToggle(entry.key, false);
											onToggle(updated.key, true);
											onValue(updated.key, current);
										}
									}}
									onDelete={() => onDelete(entry.id, entry.key)}
								/>
							))
						) : (
							<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
								No limits yet — create the first below.
							</p>
						)}
					</div>
					<RegistryCreateRow
						creating={creating}
						fields={[
							{ value: name, onChange: setName, placeholder: "Seats" },
							{ value: key, onChange: setKey, placeholder: "seats", mono: true },
							{ value: unit, onChange: setUnit, placeholder: "unit" },
						]}
						onCreate={() => void create()}
					/>
				</SheetBody>
				<SheetFooterRow>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Done
					</Button>
				</SheetFooterRow>
			</SheetContent>
		</Sheet>
	);
}

// Manageable registry row used by both the entitlements and limits drawers. When
// `value`/`onValue` are supplied (limits), a per-plan value input shows while the
// row is enabled. Editing reveals inline name/key (and unit) inputs.
export function RegistryManageRow({
	checked,
	entryKey,
	name,
	unit,
	value,
	onToggle,
	onValue,
	onSave,
	onDelete,
}: {
	checked: boolean;
	entryKey: string;
	name: string;
	unit?: string | null;
	value?: string;
	onToggle: (on: boolean) => void;
	onValue?: (value: string) => void;
	onSave: (next: { key: string; name: string; unit?: string }) => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	const hasValue = onValue !== undefined;
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const [draftKey, setDraftKey] = useState(entryKey);
	const [draftUnit, setDraftUnit] = useState(unit ?? "");
	const [busy, setBusy] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	function startEditing() {
		setDraftName(name);
		setDraftKey(entryKey);
		setDraftUnit(unit ?? "");
		setEditing(true);
	}

	async function save() {
		if (!draftName.trim() || !draftKey.trim()) return;
		setBusy(true);
		try {
			await onSave({
				key: draftKey.trim(),
				name: draftName.trim(),
				...(hasValue ? { unit: draftUnit.trim() } : {}),
			});
			setEditing(false);
		} finally {
			setBusy(false);
		}
	}

	async function remove() {
		setBusy(true);
		try {
			await onDelete();
			setDeleteOpen(false);
		} finally {
			setBusy(false);
		}
	}

	if (editing) {
		return (
			<div className="flex items-center gap-2 rounded-lg border px-3 py-2">
				<input
					value={draftName}
					onChange={(event) => setDraftName(event.target.value)}
					placeholder="Name"
					className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
				/>
				<input
					value={draftKey}
					onChange={(event) => setDraftKey(event.target.value)}
					placeholder="key"
					className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
				/>
				{hasValue ? (
					<input
						value={draftUnit}
						onChange={(event) => setDraftUnit(event.target.value)}
						placeholder="unit"
						className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
					/>
				) : null}
				<Button type="button" size="icon" variant="ghost" onClick={() => void save()} disabled={busy}>
					<Check className="size-4" />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					onClick={() => setEditing(false)}
					disabled={busy}
				>
					<X className="size-4" />
				</Button>
			</div>
		);
	}

	return (
		<>
			<div className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
				<Checkbox checked={checked} onCheckedChange={(next) => onToggle(next === true)} />
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm">{name}</div>
					<div className="truncate font-mono text-[0.6875rem] text-muted-foreground">
						{entryKey}
						{hasValue && unit ? ` · ${unit}` : ""}
					</div>
				</div>
				{hasValue ? (
					<input
						value={value ?? ""}
						disabled={!checked}
						onChange={(event) => onValue?.(event.target.value)}
						placeholder="value"
						className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
					/>
				) : null}
				<Button type="button" size="icon" variant="ghost" onClick={startEditing} disabled={busy}>
					<Pencil className="size-4" />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="text-muted-foreground hover:text-destructive"
					onClick={() => setDeleteOpen(true)}
					disabled={busy}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete registry item?</DialogTitle>
						<DialogDescription>
							This removes <span className="font-medium text-foreground">{name}</span> from the
							reusable billing registry.
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
							disabled={busy}
							onClick={() => void remove()}
						>
							Delete item
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function RegistryCreateRow({
	fields,
	creating,
	onCreate,
}: {
	fields: {
		value: string;
		onChange: (value: string) => void;
		placeholder: string;
		mono?: boolean;
	}[];
	creating: boolean;
	onCreate: () => void;
}) {
	return (
		<div className="flex items-center gap-2 border-t pt-3">
			{fields.map((field, index) => (
				<input
					key={index}
					value={field.value}
					onChange={(event) => field.onChange(event.target.value)}
					placeholder={field.placeholder}
					className={cn(
						"h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
						field.mono && "font-mono text-xs",
					)}
				/>
			))}
			<Button type="button" size="sm" onClick={onCreate} disabled={creating}>
				<Plus className="size-4" />
				New
			</Button>
		</div>
	);
}

export function StripeLabel({ field, children }: { field: string; children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{children}
			<Tooltip>
				<TooltipTrigger asChild>
					<button type="button" className="text-muted-foreground" aria-label="Where to find this in Stripe">
						<HelpCircle className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent>{STRIPE_HINTS[field]}</TooltipContent>
			</Tooltip>
		</span>
	);
}

// Read-only share field for a plan's /billing/product/:id deeplink, with copy.
// The link is the access grant for hidden products, so it's surfaced wherever an
// admin edits a saved plan.
function DeeplinkField({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	const path = `/billing/product/${id}`;
	const url = `${window.location.origin}${path}`;

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	}

	return (
		<Field
			label="Direct link"
			hint="Anyone with this link can view and buy this product, even when it's hidden."
		>
			<div className="flex gap-2">
				<FieldInput readOnly value={path} onFocus={(event) => event.currentTarget.select()} />
				<Button type="button" variant="outline" onClick={() => void copy()}>
					<Copy className="size-4" />
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</Field>
	);
}

export function SheetFooterRow({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3.5 sm:flex-row sm:justify-end">
			{children}
		</div>
	);
}

export function DrawerMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg bg-muted/50 px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
				<div className="mt-1 truncate text-sm font-medium tabular-nums">{value}</div>
		</div>
	);
}

export function Chip({
	children,
	variant = "muted",
}: {
	children: ReactNode;
	variant?: "muted" | "outline";
}) {
	return (
		<span
			className={cn(
				"rounded-md px-1.5 py-0.5 text-[0.6875rem]",
				variant === "outline"
					? "border text-muted-foreground"
					: "bg-muted/60 font-mono text-muted-foreground",
			)}
		>
			{children}
		</span>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	body,
}: {
	icon: typeof Package;
	title: string;
	body: string;
}) {
	return (
		<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
			<div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">
				<Icon className="size-5" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">{title}</p>
				<p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
			</div>
		</div>
	);
}
