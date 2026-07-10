/**
 * Better Auth Stripe plugin assembly. Inputs are runtime env, the auth
 * database, and Stripe billing plan JSON; output is either no plugin when
 * Stripe is unconfigured or a fully configured Better Auth Stripe plugin.
 * Safe configuration points are `STRIPE_*` env vars and `STRIPE_BILLING_PLANS`.
 */
import { stripe, type StripePlan, type Subscription } from "@better-auth/stripe";
import { APIError } from "better-auth/api";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import Stripe from "stripe";

import * as schema from "../../db/schema";
import type { AuthEnv } from "../../env";
import {
	DEFAULT_STRIPE_API_VERSION,
	stripeCheckoutDefaults,
	stripePlansFromBillingPlans,
	validateStripeProductInput,
	type BillingPlanDefinition,
	type BillingPlanType,
	type StripeProductProvisionInput,
} from "../billing";
import { loadBillingPlans } from "../billing-plan-store";
import { emitWebhookEvent, WEBHOOK_EVENT_TYPES } from "../webhooks";
import { optionalEnv, parseOptionalBoolean } from "./env";
import type { AuthDatabase } from "./types";

type StripeUserDeleteCandidate = {
	id: string;
	stripeCustomerId?: string | null;
};

const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set([
	"active",
	"trialing",
	"past_due",
	"paused",
	"unpaid",
]);

export function stripeSecretConfig(env: AuthEnv) {
	const secretKey = optionalEnv(env.STRIPE_SECRET_KEY);
	const webhookSecret = optionalEnv(env.STRIPE_WEBHOOK_SECRET);
	if (!secretKey && !webhookSecret) return undefined;
	if (!secretKey || !webhookSecret) {
		throw new TypeError(
			"STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.",
		);
	}
	return { secretKey, webhookSecret };
}

export function createStripeClient(env: AuthEnv, secretKey: string) {
	const apiVersion = optionalEnv(env.STRIPE_API_VERSION) ?? DEFAULT_STRIPE_API_VERSION;
	if (apiVersion !== DEFAULT_STRIPE_API_VERSION) {
		throw new TypeError(
			`STRIPE_API_VERSION must be ${DEFAULT_STRIPE_API_VERSION} for stripe@22.2.1.`,
		);
	}
	return new Stripe(secretKey, {
		apiVersion: DEFAULT_STRIPE_API_VERSION,
		httpClient: Stripe.createFetchHttpClient(),
		maxNetworkRetries: 2,
	});
}

// Currencies Stripe charges in whole units (no minor unit). Amounts in these
// currencies are passed through unscaled; everything else is multiplied by 100.
const ZERO_DECIMAL_CURRENCIES = new Set([
	"bif",
	"clp",
	"djf",
	"gnf",
	"jpy",
	"kmf",
	"krw",
	"mga",
	"pyg",
	"rwf",
	"ugx",
	"vnd",
	"vuv",
	"xaf",
	"xof",
	"xpf",
]);

function toMinorUnits(amount: number, currency: string) {
	if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) {
		return Math.round(amount);
	}
	return Math.round(amount * 100);
}

export type StripeProvisionResult = {
	productId: string;
	priceId: string;
	lookupKey?: string;
	annualDiscountPriceId?: string;
	annualDiscountLookupKey?: string;
	seatPriceId?: string;
};

/**
 * Create a Stripe Product plus its primary Price, and optionally an annual price
 * and a per-seat price, from validated admin input. Subscription plans get
 * recurring prices; one-time plans get a single non-recurring price. Returns the
 * created identifiers so the caller can persist them on the plan row.
 */
async function createStripeProductWithPrices(
	client: Stripe,
	input: StripeProductProvisionInput,
	context: { planType: BillingPlanType; productName: string; description?: string },
): Promise<StripeProvisionResult> {
	const recurring = context.planType !== "one_time";
	const interval = input.interval ?? "month";

	const product = await client.products.create({
		name: context.productName,
		...(context.description ? { description: context.description } : {}),
		...(input.statementDescriptor ? { statement_descriptor: input.statementDescriptor } : {}),
		...(input.unitLabel ? { unit_label: input.unitLabel } : {}),
		...(input.taxCode ? { tax_code: input.taxCode } : {}),
		...(input.url ? { url: input.url } : {}),
	});

	const basePrice = await client.prices.create({
		product: product.id,
		currency: input.currency,
		unit_amount: toMinorUnits(input.amount, input.currency),
		...(input.nickname ? { nickname: input.nickname } : {}),
		...(input.lookupKey ? { lookup_key: input.lookupKey } : {}),
		...(input.taxBehavior ? { tax_behavior: input.taxBehavior } : {}),
		...(recurring
			? {
					recurring: {
						interval,
						...(input.intervalCount ? { interval_count: input.intervalCount } : {}),
						...(input.usageType ? { usage_type: input.usageType } : {}),
					},
				}
			: {}),
	});

	const result: StripeProvisionResult = {
		productId: product.id,
		priceId: basePrice.id,
		...(basePrice.lookup_key ? { lookupKey: basePrice.lookup_key } : {}),
	};

	if (recurring && input.annualAmount !== undefined) {
		const annual = await client.prices.create({
			product: product.id,
			currency: input.currency,
			unit_amount: toMinorUnits(input.annualAmount, input.currency),
			...(input.annualLookupKey ? { lookup_key: input.annualLookupKey } : {}),
			...(input.taxBehavior ? { tax_behavior: input.taxBehavior } : {}),
			recurring: { interval: "year" },
		});
		result.annualDiscountPriceId = annual.id;
		if (annual.lookup_key) result.annualDiscountLookupKey = annual.lookup_key;
	}

	if (recurring && input.seatAmount !== undefined) {
		const seat = await client.prices.create({
			product: product.id,
			currency: input.currency,
			unit_amount: toMinorUnits(input.seatAmount, input.currency),
			...(input.seatLookupKey ? { lookup_key: input.seatLookupKey } : {}),
			...(input.taxBehavior ? { tax_behavior: input.taxBehavior } : {}),
			recurring: {
				interval,
				...(input.intervalCount ? { interval_count: input.intervalCount } : {}),
				...(input.usageType ? { usage_type: input.usageType } : {}),
			},
		});
		result.seatPriceId = seat.id;
	}

	return result;
}

/**
 * When a plan-create payload carries a `stripe` block, provision the Stripe
 * Product/Price(s) and return the payload with the resulting price identifiers
 * merged in (and the `stripe` block stripped) so the plan store persists real
 * `price_…` ids. Payloads without a `stripe` block pass through unchanged.
 */
export async function applyStripeProvisioning(
	env: AuthEnv,
	input: unknown,
): Promise<Record<string, unknown>> {
	const value = (input ?? {}) as Record<string, unknown>;
	if (value.stripe === undefined || value.stripe === null) return value;

	const secrets = stripeSecretConfig(env);
	if (!secrets) {
		throw new APIError("NOT_IMPLEMENTED", {
			message: "Stripe billing is not configured. Add STRIPE_SECRET_KEY to create products.",
		});
	}

	const provision = validateStripeProductInput(value.stripe, "stripe");
	const planType: BillingPlanType = value.type === "one_time" ? "one_time" : "subscription";
	const label = typeof value.label === "string" ? value.label.trim() : "";
	const name = typeof value.name === "string" ? value.name.trim() : "";
	const productName = provision.productName ?? (label || name);
	if (!productName) {
		throw new APIError("BAD_REQUEST", { message: "A product name is required." });
	}
	const description =
		provision.description ??
		(typeof value.description === "string" && value.description.trim()
			? value.description.trim()
			: undefined);

	const client = createStripeClient(env, secrets.secretKey);
	const result = await createStripeProductWithPrices(client, provision, {
		planType,
		productName,
		...(description ? { description } : {}),
	});

	const rest = { ...value };
	delete rest.stripe;
	return {
		...rest,
		priceId: result.priceId,
		...(result.lookupKey ? { lookupKey: result.lookupKey } : {}),
		...(result.annualDiscountPriceId
			? { annualDiscountPriceId: result.annualDiscountPriceId }
			: {}),
		...(result.annualDiscountLookupKey
			? { annualDiscountLookupKey: result.annualDiscountLookupKey }
			: {}),
		...(result.seatPriceId ? { seatPriceId: result.seatPriceId } : {}),
	};
}

export type ResolvedStripePrice = {
	amount: number | null;
	currency: string;
	interval?: string;
	intervalCount?: number;
};

const PRICE_CACHE_PREFIX = "passport:billing:price:";
const PRICE_CACHE_TTL_SECONDS = 3600;

/**
 * Resolve Stripe price amounts for the admin pricing table. Each id is cached in
 * the auth KV namespace (1h) to avoid hammering the Stripe API on every render.
 * Returns an empty map when Stripe is unconfigured and skips ids that fail to
 * resolve (e.g. lookup keys or deleted prices).
 */
export async function resolveStripePrices(
	env: AuthEnv,
	ids: readonly string[],
): Promise<Record<string, ResolvedStripePrice>> {
	const uniqueIds = [...new Set(ids.filter((id) => id.trim()))];
	if (uniqueIds.length === 0) return {};
	const secrets = stripeSecretConfig(env);
	if (!secrets) return {};

	const kv = env.AUTH_SECONDARY_STORAGE;
	const result: Record<string, ResolvedStripePrice> = {};
	let client: Stripe | undefined;

	for (const id of uniqueIds) {
		const cached = await kv.get(`${PRICE_CACHE_PREFIX}${id}`);
		if (cached) {
			result[id] = JSON.parse(cached) as ResolvedStripePrice;
			continue;
		}
		client ??= createStripeClient(env, secrets.secretKey);
		try {
			const price = await client.prices.retrieve(id);
			const resolved: ResolvedStripePrice = {
				amount: price.unit_amount ?? null,
				currency: price.currency,
				...(price.recurring?.interval ? { interval: price.recurring.interval } : {}),
				...(price.recurring?.interval_count
					? { intervalCount: price.recurring.interval_count }
					: {}),
			};
			result[id] = resolved;
			await kv.put(`${PRICE_CACHE_PREFIX}${id}`, JSON.stringify(resolved), {
				expirationTtl: PRICE_CACHE_TTL_SECONDS,
			});
		} catch {
			// Unresolvable id (lookup key, deleted price) — omit from the table.
		}
	}
	return result;
}

function subscriptionWebhookData(subscription: Subscription) {
	return {
		subscriptionId: subscription.id,
		referenceId: subscription.referenceId,
		plan: subscription.plan,
		status: subscription.status,
		seats: subscription.seats ?? null,
		billingInterval: subscription.billingInterval ?? null,
		cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
		periodEnd: subscription.periodEnd?.toISOString?.() ?? null,
	};
}

async function emitBillingWebhook(
	env: AuthEnv,
	db: AuthDatabase,
	type: (typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES],
	data: Record<string, unknown>,
) {
	await emitWebhookEvent(env, db, type, data);
}

/**
 * Keep a subscription row's stripeCustomerId aligned with Stripe's source of
 * truth. The Better Auth Stripe plugin never writes stripeCustomerId from its
 * customer.subscription.* webhook handler, and its upgrade path can rewrite a
 * row's stripeSubscriptionId without touching the customer. When a user has more
 * than one Stripe customer, the stored id can point at the wrong one; Stripe then
 * rejects cancel/billing-portal sessions with "The session's customer does not
 * match the subscription's customer." Reconciling on every subscription webhook
 * self-heals an affected row on its next event.
 *
 * Input: the Stripe.Subscription carried by a customer.subscription.* event.
 * Output: none. Updates only the matching row, and only when the stored customer
 * differs (or is null), so unchanged subscriptions don't churn updatedAt.
 */
async function reconcileSubscriptionCustomer(db: AuthDatabase, subscription: Stripe.Subscription) {
	const stripeSubscriptionId = subscription.id;
	const customerId =
		typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
	if (!stripeSubscriptionId || !customerId) return;
	await db
		.update(schema.subscription)
		.set({ stripeCustomerId: customerId })
		.where(
			and(
				eq(schema.subscription.stripeSubscriptionId, stripeSubscriptionId),
				or(
					isNull(schema.subscription.stripeCustomerId),
					ne(schema.subscription.stripeCustomerId, customerId),
				),
			),
		);
}

function stripePlansWithCallbacks(
	env: AuthEnv,
	db: AuthDatabase,
	plans: readonly BillingPlanDefinition[],
): StripePlan[] {
	// One-time plans are sold through the custom payment-mode checkout, not the
	// Better Auth subscription flow, so keep them out of the subscription list.
	const subscriptionPlans = plans.filter((plan) => (plan.type ?? "subscription") !== "one_time");
	return stripePlansFromBillingPlans(subscriptionPlans).map((plan) => {
		const source = subscriptionPlans.find(
			(candidate) => candidate.name.toLowerCase() === plan.name.toLowerCase(),
		);
		if (!source?.freeTrialDays) return plan;
		return {
			...plan,
			freeTrial: {
				days: source.freeTrialDays,
				onTrialStart: async (subscription) => {
					await emitBillingWebhook(
						env,
						db,
						WEBHOOK_EVENT_TYPES.BILLING_TRIAL_STARTED,
						subscriptionWebhookData(subscription),
					);
				},
				onTrialEnd: async ({ subscription }) => {
					await emitBillingWebhook(
						env,
						db,
						WEBHOOK_EVENT_TYPES.BILLING_TRIAL_ENDED,
						subscriptionWebhookData(subscription),
					);
				},
				onTrialExpired: async (subscription) => {
					await emitBillingWebhook(
						env,
						db,
						WEBHOOK_EVENT_TYPES.BILLING_TRIAL_EXPIRED,
						subscriptionWebhookData(subscription),
					);
				},
			},
		};
	});
}

async function authorizeBillingReference(
	db: AuthDatabase,
	input: {
		user: { id: string };
		referenceId: string;
		action: string;
	},
) {
	if (input.referenceId === input.user.id) return true;

	const [membership] = await db
		.select({
			role: schema.member.role,
		})
		.from(schema.member)
		.where(
			and(
				eq(schema.member.userId, input.user.id),
				eq(schema.member.organizationId, input.referenceId),
			),
		)
		.limit(1);
	if (!membership) return false;
	if (input.action === "list-subscription" || input.action === "list-purchases") return true;
	return membership.role === "owner" || membership.role === "admin";
}

function checkoutSessionParams(env: AuthEnv) {
	const defaults = stripeCheckoutDefaults(env);
	return {
		params: {
			...(defaults.allowPromotionCodes === undefined
				? {}
				: { allow_promotion_codes: defaults.allowPromotionCodes }),
			...(defaults.automaticTaxEnabled === undefined
				? {}
				: { automatic_tax: { enabled: defaults.automaticTaxEnabled } }),
			...(defaults.taxIDCollectionEnabled === undefined
				? {}
				: { tax_id_collection: { enabled: defaults.taxIDCollectionEnabled } }),
			...(defaults.billingAddressCollection
				? { billing_address_collection: defaults.billingAddressCollection }
				: {}),
			...(defaults.customTextSubmitMessage
				? {
						custom_text: {
							submit: {
								message: defaults.customTextSubmitMessage,
							},
						},
					}
				: {}),
		},
	};
}

export type OneTimeCheckoutInput = {
	plan: string;
	customerType: "user" | "organization";
	referenceId?: string;
	user: { id: string; email: string };
	successUrl: string;
	cancelUrl: string;
};

async function resolveOneTimePriceId(client: Stripe, plan: BillingPlanDefinition) {
	if (plan.priceId) return plan.priceId;
	if (plan.lookupKey) {
		const prices = await client.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
		const [price] = prices.data;
		if (price) return price.id;
	}
	throw new APIError("BAD_REQUEST", {
		message: "This product has no Stripe price configured.",
	});
}

/**
 * Create a Stripe Checkout Session in payment mode for a one-time plan. Mirrors
 * the subscription plugin's authorization and checkout defaults, but settles a
 * single payment instead of starting a subscription. Personal-only plans reject
 * organization customers.
 */
export async function createOneTimeCheckout(
	env: AuthEnv,
	db: AuthDatabase,
	input: OneTimeCheckoutInput,
): Promise<{ url: string }> {
	const secrets = stripeSecretConfig(env);
	if (!secrets) {
		throw new APIError("NOT_IMPLEMENTED", { message: "Stripe billing is not configured." });
	}

	const plans = await loadBillingPlans(env, db);
	const plan = plans.find((entry) => entry.name.toLowerCase() === input.plan.toLowerCase());
	if (!plan) {
		throw new APIError("NOT_FOUND", { message: "Plan not found." });
	}
	if ((plan.type ?? "subscription") !== "one_time") {
		throw new APIError("BAD_REQUEST", { message: "This plan is not a one-time product." });
	}

	const isOrganization = input.customerType === "organization";
	if (isOrganization && plan.personalOnly) {
		throw new APIError("FORBIDDEN", {
			message: "This product can only be purchased by personal accounts.",
		});
	}

	const referenceId = isOrganization ? input.referenceId : input.user.id;
	if (!referenceId) {
		throw new APIError("BAD_REQUEST", { message: "A billing reference is required." });
	}
	if (isOrganization) {
		const authorized = await authorizeBillingReference(db, {
			user: input.user,
			referenceId,
			action: "one-time-checkout",
		});
		if (!authorized) {
			throw new APIError("FORBIDDEN", {
				message: "You do not have access to bill this organization.",
			});
		}
	}

	// Stripe requires absolute success/cancel URLs; the client sends app-relative
	// paths, so resolve them against the configured issuer origin.
	const base = env.BETTER_AUTH_URL;
	const successUrl = new URL(input.successUrl, base).toString();
	const cancelUrl = new URL(input.cancelUrl, base).toString();

	const client = createStripeClient(env, secrets.secretKey);
	const priceId = await resolveOneTimePriceId(client, plan);

	const customerId = isOrganization
		? (
				await db
					.select({ stripeCustomerId: schema.organization.stripeCustomerId })
					.from(schema.organization)
					.where(eq(schema.organization.id, referenceId))
					.limit(1)
			)[0]?.stripeCustomerId
		: (
				await db
					.select({ stripeCustomerId: schema.user.stripeCustomerId })
					.from(schema.user)
					.where(eq(schema.user.id, referenceId))
					.limit(1)
			)[0]?.stripeCustomerId;

	const checkoutDefaults = checkoutSessionParams(env).params;
	const session = await client.checkout.sessions.create({
		mode: "payment",
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: successUrl,
		cancel_url: cancelUrl,
		client_reference_id: referenceId,
		metadata: {
			passportPlan: plan.name.toLowerCase(),
			passportCustomerType: input.customerType,
			passportReferenceId: referenceId,
		},
		...(customerId
			? { customer: customerId }
			: { customer_email: input.user.email, customer_creation: "always" }),
		...checkoutDefaults,
	});

	if (!session.url) {
		throw new APIError("BAD_REQUEST", { message: "Could not start checkout." });
	}
	return { url: session.url };
}

/**
 * Persist and announce a completed one-time purchase. Better Auth's subscription
 * handler ignores payment-mode checkouts, so this runs from the plugin's
 * `onEvent` hook. Only checkouts carrying our `passportPlan` metadata and a
 * settled payment are recorded; the checkout session id is the idempotency key,
 * so Stripe's redelivered webhooks insert at most one row and emit at most one
 * event.
 */
export async function recordOneTimePurchase(
	env: AuthEnv,
	db: AuthDatabase,
	session: Stripe.Checkout.Session,
) {
	if (session.mode !== "payment" || session.payment_status !== "paid") return;

	const metadata = session.metadata ?? {};
	const plan = metadata.passportPlan?.trim();
	const referenceId = metadata.passportReferenceId?.trim() || session.client_reference_id;
	if (!plan || !referenceId) return;

	const customerId =
		typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
	const paymentIntentId =
		typeof session.payment_intent === "string"
			? session.payment_intent
			: (session.payment_intent?.id ?? null);

	const [row] = await db
		.insert(schema.oneTimePurchase)
		.values({
			id: crypto.randomUUID(),
			plan: plan.toLowerCase(),
			referenceId,
			stripeCustomerId: customerId,
			stripeCheckoutSessionId: session.id,
			stripePaymentIntentId: paymentIntentId,
			status: "completed",
			quantity: 1,
			amountTotal: session.amount_total ?? null,
			currency: session.currency ?? null,
			purchasedAt: new Date(),
		})
		.onConflictDoNothing({ target: schema.oneTimePurchase.stripeCheckoutSessionId })
		.returning();

	// Conflict: an earlier delivery already fulfilled this checkout — don't re-emit.
	if (!row) return;

	await emitBillingWebhook(
		env,
		db,
		WEBHOOK_EVENT_TYPES.BILLING_ONE_TIME_PURCHASE_COMPLETED,
		{
			purchaseId: row.id,
			plan: row.plan,
			referenceId: row.referenceId,
			customerType:
				metadata.passportCustomerType === "organization" ? "organization" : "user",
			quantity: row.quantity,
			amountTotal: row.amountTotal ?? null,
			currency: row.currency ?? null,
			purchasedAt: row.purchasedAt?.toISOString() ?? null,
		},
	);
}

export type OneTimePurchaseSummary = {
	id: string;
	plan: string;
	status: string;
	quantity: number;
	amountTotal: number | null;
	currency: string | null;
	purchasedAt: string | null;
	createdAt: string;
};

export type ListOneTimePurchasesInput = {
	user: { id: string };
	customerType: "user" | "organization";
	referenceId?: string;
};

/**
 * List a customer's one-time purchases for the billing UI. Mirrors the
 * authorization of the Better Auth subscription list: personal purchases are
 * always visible to their owner, and any organization member may read their
 * organization's purchases. Raw Stripe identifiers are intentionally excluded.
 */
export async function listOneTimePurchases(
	db: AuthDatabase,
	input: ListOneTimePurchasesInput,
): Promise<OneTimePurchaseSummary[]> {
	const isOrganization = input.customerType === "organization";
	const referenceId = isOrganization ? input.referenceId : input.user.id;
	if (!referenceId) {
		throw new APIError("BAD_REQUEST", { message: "A billing reference is required." });
	}
	if (isOrganization) {
		const authorized = await authorizeBillingReference(db, {
			user: input.user,
			referenceId,
			action: "list-purchases",
		});
		if (!authorized) {
			throw new APIError("FORBIDDEN", {
				message: "You do not have access to view this organization's purchases.",
			});
		}
	}

	const rows = await db
		.select({
			id: schema.oneTimePurchase.id,
			plan: schema.oneTimePurchase.plan,
			status: schema.oneTimePurchase.status,
			quantity: schema.oneTimePurchase.quantity,
			amountTotal: schema.oneTimePurchase.amountTotal,
			currency: schema.oneTimePurchase.currency,
			purchasedAt: schema.oneTimePurchase.purchasedAt,
			createdAt: schema.oneTimePurchase.createdAt,
		})
		.from(schema.oneTimePurchase)
		.where(eq(schema.oneTimePurchase.referenceId, referenceId))
		.orderBy(desc(schema.oneTimePurchase.createdAt));

	return rows.map((row) => ({
		id: row.id,
		plan: row.plan,
		status: row.status,
		quantity: row.quantity,
		amountTotal: row.amountTotal ?? null,
		currency: row.currency ?? null,
		purchasedAt: row.purchasedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
	}));
}

export function buildStripePlugins(env: AuthEnv, db: AuthDatabase) {
	const secrets = stripeSecretConfig(env);
	if (!secrets) return [];

	const stripeClient = createStripeClient(env, secrets.secretKey);
	const createCustomerOnSignUp =
		parseOptionalBoolean(
			env.STRIPE_CREATE_CUSTOMER_ON_SIGN_UP,
			"STRIPE_CREATE_CUSTOMER_ON_SIGN_UP",
		) ?? true;
	const requireEmailVerification =
		parseOptionalBoolean(
			env.STRIPE_BILLING_REQUIRE_EMAIL_VERIFICATION,
			"STRIPE_BILLING_REQUIRE_EMAIL_VERIFICATION",
		) ?? true;

	return [
		stripe({
			stripeClient,
			stripeWebhookSecret: secrets.webhookSecret,
			createCustomerOnSignUp,
			onEvent: async (event) => {
				if (event.type === "checkout.session.completed") {
					await recordOneTimePurchase(env, db, event.data.object);
				} else if (
					event.type === "customer.subscription.created" ||
					event.type === "customer.subscription.updated"
				) {
					// Runs after Better Auth has upserted the row, so the lookup by
					// stripeSubscriptionId finds it and corrects a stale customer.
					await reconcileSubscriptionCustomer(db, event.data.object);
				}
			},
			getCustomerCreateParams: async (user) => ({
				metadata: {
					passportIssuer: env.BETTER_AUTH_URL,
					passportUserId: user.id,
				},
			}),
			onCustomerCreate: async ({ user }) => {
				await emitBillingWebhook(
					env,
					db,
					WEBHOOK_EVENT_TYPES.BILLING_CUSTOMER_CREATED,
					{
						customerType: "user",
						userId: user.id,
					},
				);
			},
			subscription: {
						enabled: true,
						plans: async () =>
							stripePlansWithCallbacks(env, db, await loadBillingPlans(env, db)),
						requireEmailVerification,
						authorizeReference: (data) => authorizeBillingReference(db, data),
						getCheckoutSessionParams: () => checkoutSessionParams(env),
						onSubscriptionComplete: async ({ subscription }) => {
							await emitBillingWebhook(
								env,
								db,
								WEBHOOK_EVENT_TYPES.BILLING_SUBSCRIPTION_COMPLETED,
								subscriptionWebhookData(subscription),
							);
						},
						onSubscriptionCreated: async ({ subscription }) => {
							await emitBillingWebhook(
								env,
								db,
								WEBHOOK_EVENT_TYPES.BILLING_SUBSCRIPTION_CREATED,
								subscriptionWebhookData(subscription),
							);
						},
						onSubscriptionUpdate: async ({ subscription }) => {
							await emitBillingWebhook(
								env,
								db,
								WEBHOOK_EVENT_TYPES.BILLING_SUBSCRIPTION_UPDATED,
								subscriptionWebhookData(subscription),
							);
						},
						onSubscriptionCancel: async ({ subscription }) => {
							await emitBillingWebhook(
								env,
								db,
								WEBHOOK_EVENT_TYPES.BILLING_SUBSCRIPTION_CANCELED,
								subscriptionWebhookData(subscription),
							);
						},
						onSubscriptionDeleted: async ({ subscription }) => {
							await emitBillingWebhook(
								env,
								db,
								WEBHOOK_EVENT_TYPES.BILLING_SUBSCRIPTION_DELETED,
								subscriptionWebhookData(subscription),
							);
						},
					},
			organization: {
				enabled: true,
				getCustomerCreateParams: async (organization) => ({
					metadata: {
						passportIssuer: env.BETTER_AUTH_URL,
						passportOrganizationId: organization.id,
					},
				}),
				onCustomerCreate: async ({ organization }) => {
					await emitBillingWebhook(
						env,
						db,
						WEBHOOK_EVENT_TYPES.BILLING_CUSTOMER_CREATED,
						{
							customerType: "organization",
							organizationId: organization.id,
						},
					);
				},
			},
		}),
	];
}

export async function assertBillingAllowsUserDeletion(
	env: AuthEnv,
	user: StripeUserDeleteCandidate,
) {
	const secrets = stripeSecretConfig(env);
	if (!secrets || !user.stripeCustomerId) return;

	const stripeClient = createStripeClient(env, secrets.secretKey);
	for await (const subscription of stripeClient.subscriptions.list({
		customer: user.stripeCustomerId,
		status: "all",
		limit: 100,
	})) {
		if (!ACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(subscription.status)) continue;
		throw new APIError("BAD_REQUEST", {
			message: "Cancel your active subscription before deleting your account.",
		});
	}
}
