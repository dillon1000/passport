/**
 * TanStack Query runtime configuration and fetch helpers. Query keys are the
 * stable inputs for browser-side server-state caches, and `readAPIJSON`
 * normalizes Worker and Better Auth error responses before page hooks render
 * them as status banners.
 */
import { QueryClient } from "@tanstack/react-query";

export const APP_QUERY_STALE_TIME_MS = 30_000;

export function createAppQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: APP_QUERY_STALE_TIME_MS,
				retry: 1,
				refetchOnWindowFocus: false,
			},
			mutations: {
				retry: 0,
			},
		},
	});
}

export const queryKeys = {
	accountActivity: (userId: string | undefined) => ["account-activity", userId] as const,
	adminAudit: () => ["admin-audit"] as const,
	adminUsers: (input: { offset: number; search?: string }) => ["admin-users", input] as const,
	agentApprovals: () => ["agent-approvals"] as const,
	agents: (userId: string | undefined) => ["agents", userId] as const,
	applications: (cursor?: string | null) => ["applications", cursor ?? null] as const,
	billingAdmin: () => ["billing-admin"] as const,
	billingCatalog: () => ["billing-catalog"] as const,
	billingCustomer: (input: { customerType: string; referenceId?: string }) =>
		["billing-customer", input] as const,
	billingPrices: (ids: readonly string[]) => ["billing-prices", [...ids].sort()] as const,
	brandConfig: () => ["brand-config"] as const,
	captchaConfig: () => ["captcha-config"] as const,
	consentClientMetadata: (clientId: string) => ["consent-client-metadata", clientId] as const,
	managedOAuthClients: (cursor?: string | null) => ["managed-oauth-clients", cursor ?? null] as const,
	oauthProxy: () => ["oauth-proxy"] as const,
	oidcConfiguration: () => ["oidc-configuration"] as const,
	organizationDetails: (organizationId: string | undefined) =>
		["organization-details", organizationId] as const,
	organizations: (userId: string | undefined) => ["organizations", userId] as const,
	product: (productId: string | undefined) => ["billing-product", productId] as const,
	securityCredentials: (userId: string | undefined) => ["security-credentials", userId] as const,
	sessions: (userId: string | undefined) => ["sessions", userId] as const,
	settings: (email: string | undefined) => ["settings", email] as const,
	webhookDeliveries: (endpointId: string) => ["webhook-deliveries", endpointId] as const,
	webhooks: () => ["webhooks"] as const,
};

export async function readAPIJSON<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as
			| { error?: string; message?: string }
			| null;
		throw new Error(payload?.error ?? payload?.message ?? response.statusText);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export async function fetchAPIJSON<T>(input: RequestInfo | URL, init?: RequestInit) {
	return readAPIJSON<T>(await fetch(input, init));
}
