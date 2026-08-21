/**
 * Public sign-in method discovery contract. The browser sends one normalized
 * account identifier; the Worker returns only the methods that can start from
 * the sign-in page. The response does not include user profile data.
 */
import { z } from "zod";

import type { SocialProviderId } from "@/components/auth/social-provider-config";
import { fetchAPIJSON } from "@/lib/query-client";

export const signInMethodRequestSchema = z.object({
	credential: z.string().trim().min(1).max(320),
});

export type SignInMethods = {
	password: boolean;
	passkey: boolean;
	magicLink: boolean;
	socialProviders: SocialProviderId[];
};

export async function discoverSignInMethods(credential: string) {
	return fetchAPIJSON<SignInMethods>("/api/sign-in-methods", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ credential: credential.trim() }),
	});
}
