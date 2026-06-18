/**
 * Browser auth client configuration. The plugin list must match server auth
 * capabilities closely enough for generated client methods and extra metadata
 * fields, such as team logos, to stay typed and callable from React pages.
 */
import { agentAuthClient } from "@better-auth/agent-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";
import {
	adminClient,
	lastLoginMethodClient,
	magicLinkClient,
	multiSessionClient,
	organizationClient,
	phoneNumberClient,
	twoFactorClient,
	usernameClient,
} from "better-auth/client/plugins";

import { resolveAuthCallbackURL } from "@/lib/auth-flow";

const authBaseURL =
	typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const authClient = createAuthClient({
	baseURL: authBaseURL,
	plugins: [
		adminClient(),
		agentAuthClient(),
		lastLoginMethodClient(),
		multiSessionClient(),
		magicLinkClient(),
		organizationClient({
			teams: {
				enabled: true,
			},
			schema: {
				team: {
					additionalFields: {
						logo: {
							type: "string",
							required: false,
							input: true,
						},
					},
				},
			},
		}),
		usernameClient(),
		phoneNumberClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				if (typeof window === "undefined") return;

				const searchParams = new URLSearchParams(window.location.search);
				const callbackURL = resolveAuthCallbackURL(searchParams);
				window.location.href = `/two-factor?callbackURL=${encodeURIComponent(callbackURL)}`;
			},
		}),
		passkeyClient(),
		oauthProviderClient(),
	],
});
