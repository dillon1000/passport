import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import type { AuthEnv } from "../../env";
import { WEBHOOK_EVENT_TYPES } from "../webhooks";
import {
	applyStripeProvisioning,
	recordOneTimePurchase,
	type StripeProvisioningClient,
} from "./stripe";
import type { AuthDatabase } from "./types";

const stripeMocks = {
	productsCreate: vi.fn(),
	pricesCreate: vi.fn(),
};

const stripeClient = {
	products: { create: async (input: Parameters<Stripe["products"]["create"]>[0]) => stripeMocks.productsCreate(input) },
	prices: { create: async (input: Parameters<Stripe["prices"]["create"]>[0]) => stripeMocks.pricesCreate(input) },
} satisfies StripeProvisioningClient;

const emitWebhookEvent = vi.fn();

const env = { BETTER_AUTH_URL: "https://passport.test" } as unknown as AuthEnv;

// Minimal drizzle stand-in for insert→values→onConflictDoNothing→returning.
// `returning` controls the conflict outcome: a row means inserted, [] means a
// redelivery hit the unique constraint.
function purchaseDb(returning: unknown[]) {
	const captured: { values?: { [key: string]: unknown } } = {};
	const db = {
		insert: () => ({
			values: (values: { [key: string]: unknown }) => {
				captured.values = values;
				return {
					onConflictDoNothing: () => ({
						returning: () => Promise.resolve(returning),
					}),
				};
			},
		}),
	} as unknown as AuthDatabase;
	return { db, captured };
}

function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
	return {
		id: "cs_test_123",
		mode: "payment",
		payment_status: "paid",
		customer: "cus_123",
		payment_intent: "pi_123",
		amount_total: 9900,
		currency: "usd",
		client_reference_id: null,
		metadata: {
			passportPlan: "Lifetime",
			passportCustomerType: "user",
			passportReferenceId: "user_123",
		},
		...overrides,
	} as unknown as Stripe.Checkout.Session;
}

describe("recordOneTimePurchase", () => {
	beforeEach(() => {
		emitWebhookEvent.mockClear();
	});

	it("persists the purchase and emits a completion webhook for a paid checkout", async () => {
		const { db, captured } = purchaseDb([
			{
				id: "otp_1",
				plan: "lifetime",
				referenceId: "user_123",
				quantity: 1,
				amountTotal: 9900,
				currency: "usd",
				purchasedAt: new Date("2026-06-19T00:00:00.000Z"),
			},
		]);

		await recordOneTimePurchase(env, db, checkoutSession(), emitWebhookEvent);

		expect(captured.values).toMatchObject({
			plan: "lifetime",
			referenceId: "user_123",
			stripeCustomerId: "cus_123",
			stripeCheckoutSessionId: "cs_test_123",
			stripePaymentIntentId: "pi_123",
			status: "completed",
			amountTotal: 9900,
			currency: "usd",
		});
		expect(emitWebhookEvent).toHaveBeenCalledTimes(1);
		expect(emitWebhookEvent).toHaveBeenCalledWith(
			env,
			db,
			WEBHOOK_EVENT_TYPES.BILLING_ONE_TIME_PURCHASE_COMPLETED,
			expect.objectContaining({
				purchaseId: "otp_1",
				plan: "lifetime",
				referenceId: "user_123",
				customerType: "user",
			}),
		);
	});

	it("does not re-emit when a redelivered checkout hits the unique constraint", async () => {
		const { db } = purchaseDb([]);
		await recordOneTimePurchase(env, db, checkoutSession(), emitWebhookEvent);
		expect(emitWebhookEvent).not.toHaveBeenCalled();
	});

	it("ignores subscription-mode checkouts", async () => {
		const insert = vi.fn();
		const db = { insert } as unknown as AuthDatabase;
		await recordOneTimePurchase(env, db, checkoutSession({ mode: "subscription" }), emitWebhookEvent);
		expect(insert).not.toHaveBeenCalled();
		expect(emitWebhookEvent).not.toHaveBeenCalled();
	});

	it("ignores unpaid checkouts", async () => {
		const insert = vi.fn();
		const db = { insert } as unknown as AuthDatabase;
		await recordOneTimePurchase(env, db, checkoutSession({ payment_status: "unpaid" }), emitWebhookEvent);
		expect(insert).not.toHaveBeenCalled();
	});

	it("ignores checkouts missing Passport plan metadata", async () => {
		const insert = vi.fn();
		const db = { insert } as unknown as AuthDatabase;
		await recordOneTimePurchase(
			env,
			db,
			checkoutSession({ metadata: {}, client_reference_id: null }),
			emitWebhookEvent,
		);
		expect(insert).not.toHaveBeenCalled();
	});

	it("falls back to client_reference_id when the reference metadata is absent", async () => {
		const { db, captured } = purchaseDb([
			{ id: "otp_2", plan: "lifetime", referenceId: "user_456", quantity: 1 },
		]);
		await recordOneTimePurchase(
			env,
			db,
			checkoutSession({
				client_reference_id: "user_456",
				metadata: { passportPlan: "Lifetime", passportCustomerType: "user" },
			}),
			emitWebhookEvent,
		);
		expect(captured.values).toMatchObject({ referenceId: "user_456" });
		expect(emitWebhookEvent).toHaveBeenCalledTimes(1);
	});
});

describe("applyStripeProvisioning", () => {
	const stripeEnv = {
		BETTER_AUTH_URL: "https://passport.test",
		STRIPE_SECRET_KEY: "sk_test_123",
		STRIPE_WEBHOOK_SECRET: "whsec_123",
	} as unknown as AuthEnv;

	beforeEach(() => {
		stripeMocks.productsCreate.mockReset();
		stripeMocks.pricesCreate.mockReset();
	});

	it("passes payloads without a stripe block through unchanged", async () => {
		const input = { name: "pro", priceId: "price_existing" };
		expect(await applyStripeProvisioning(stripeEnv, input, { createClient: () => stripeClient })).toEqual(input);
		expect(stripeMocks.productsCreate).not.toHaveBeenCalled();
	});

	it("creates a product, monthly, annual, and seat prices and merges the ids", async () => {
		stripeMocks.productsCreate.mockResolvedValue({ id: "prod_new" });
		stripeMocks.pricesCreate
			.mockResolvedValueOnce({ id: "price_month", lookup_key: "pro_monthly" })
			.mockResolvedValueOnce({ id: "price_year", lookup_key: "pro_yearly" })
			.mockResolvedValueOnce({ id: "price_seat", lookup_key: null });

		const result = await applyStripeProvisioning(stripeEnv, {
			name: "pro",
			label: "Pro",
			type: "subscription",
			stripe: {
				amount: 29.99,
				currency: "usd",
				interval: "month",
				annualAmount: 290,
				seatAmount: 10,
				annualLookupKey: "pro_yearly",
			},
		}, { createClient: () => stripeClient });

		expect(result).toMatchObject({
			name: "pro",
			label: "Pro",
			priceId: "price_month",
			lookupKey: "pro_monthly",
			annualDiscountPriceId: "price_year",
			annualDiscountLookupKey: "pro_yearly",
			seatPriceId: "price_seat",
		});
		expect(result.stripe).toBeUndefined();
		expect(stripeMocks.productsCreate).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Pro" }),
		);
		// 29.99 USD becomes 2999 minor units on the recurring monthly price.
		expect(stripeMocks.pricesCreate).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				product: "prod_new",
				currency: "usd",
				unit_amount: 2999,
				recurring: expect.objectContaining({ interval: "month" }),
			}),
		);
	});

	it("creates a single non-recurring price for one-time products", async () => {
		stripeMocks.productsCreate.mockResolvedValue({ id: "prod_lt" });
		stripeMocks.pricesCreate.mockResolvedValue({ id: "price_lt", lookup_key: null });

		const result = await applyStripeProvisioning(stripeEnv, {
			name: "lifetime",
			type: "one_time",
			stripe: { amount: 99, currency: "usd", annualAmount: 999 },
		}, { createClient: () => stripeClient });

		expect(result.priceId).toBe("price_lt");
		// One-time products ignore recurring, annual, and seat inputs.
		expect(stripeMocks.pricesCreate).toHaveBeenCalledTimes(1);
		expect(stripeMocks.pricesCreate).toHaveBeenCalledWith(
			expect.not.objectContaining({ recurring: expect.anything() }),
		);
	});

	it("rejects provisioning when Stripe is not configured", async () => {
		await expect(
			applyStripeProvisioning({ BETTER_AUTH_URL: "https://passport.test" } as AuthEnv, {
				name: "pro",
				stripe: { amount: 10, currency: "usd" },
			}),
		).rejects.toThrow("Stripe billing is not configured.");
	});
});
