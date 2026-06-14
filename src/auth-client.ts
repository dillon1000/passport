import { agentAuthClient } from "@better-auth/agent-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";
import {
	adminClient,
	lastLoginMethodClient,
	magicLinkClient,
	organizationClient,
	phoneNumberClient,
	twoFactorClient,
	usernameClient,
} from "better-auth/client/plugins";

const authBaseURL =
	typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const authClient = createAuthClient({
	baseURL: authBaseURL,
	plugins: [
		adminClient(),
		agentAuthClient(),
		lastLoginMethodClient(),
		magicLinkClient(),
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
		usernameClient(),
		phoneNumberClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				if (typeof window === "undefined") return;

				const searchParams = new URLSearchParams(window.location.search);
				const callbackURL = searchParams.get("callbackURL") ?? "/account";
				window.location.href = `/two-factor?callbackURL=${encodeURIComponent(callbackURL)}`;
			},
		}),
		passkeyClient(),
		oauthProviderClient(),
	],
});
