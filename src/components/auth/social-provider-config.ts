import type { PublicIconSource } from "@/components/auth/public-icon";

/**
 * Shared social provider metadata. Better Auth provider ids are the inputs used
 * by sign-in and account-linking calls; labels and icon paths are the UI output
 * reused by auth pages. Add new OAuth providers here after they are configured
 * in `auth.ts`.
 */
export type SocialProviderId = "github" | "discord" | "twitter";

export interface SocialProvider {
	id: SocialProviderId;
	label: string;
	icon: PublicIconSource;
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
	{
		id: "github",
		label: "GitHub",
		icon: { light: "/icons/github_light.svg", dark: "/icons/github_dark.svg" },
	},
	{ id: "discord", label: "Discord", icon: "/icons/discord.svg" },
	{
		id: "twitter",
		label: "X",
		icon: { light: "/icons/twitter_light.svg", dark: "/icons/twitter_dark.svg" },
	},
];
