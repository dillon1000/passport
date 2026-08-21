/**
 * Social sign-in button strip. Provider ids are the Better Auth ids configured
 * in `auth.ts`; selecting a button reports the id upward and icons render from
 * `public/icons` so provider marks stay centralized with the rest of the UI.
 */
import { PublicIcon } from "@/components/auth/public-icon";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "@/components/auth/social-provider-config";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";

export function SocialButtons({
	onSelect,
	disabled,
	lastUsedMethod,
	providers: allowedProviders,
}: {
	onSelect: (provider: SocialProviderId) => void;
	disabled?: boolean;
	/** Better Auth's cookie value; its matching provider gets the visible marker. */
	lastUsedMethod?: string | null;
	/** Account-linked providers to show. The default is every configured UI provider. */
	providers?: SocialProviderId[];
}) {
	const providers = SOCIAL_PROVIDERS.filter(
		(provider) => !allowedProviders || allowedProviders.includes(provider.id),
	).sort((left, right) => {
		if (left.id === lastUsedMethod) return -1;
		if (right.id === lastUsedMethod) return 1;
		return 0;
	});

	return (
		<div className="grid grid-cols-3 gap-2">
			{providers.map(({ id, label, icon }) => (
				<Button
					key={id}
					variant="outline"
					size="lg"
					type="button"
					className="relative w-full"
					disabled={disabled}
					onClick={() => onSelect(id)}
				>
					<PublicIcon src={icon} className="size-4" />
					{label}
					{lastUsedMethod === id ? (
						<Badge className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap" variant="secondary">
							Last used
						</Badge>
					) : null}
				</Button>
			))}
		</div>
	);
}
