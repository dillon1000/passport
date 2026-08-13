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
}: {
	onSelect: (provider: SocialProviderId) => void;
	disabled?: boolean;
	/** Better Auth's cookie value; its matching provider gets the visible marker. */
	lastUsedMethod?: string | null;
}) {
	return (
		<div className="grid grid-cols-3 gap-2">
			{SOCIAL_PROVIDERS.map(({ id, label, icon }) => (
				<Button
					key={id}
					variant="outline"
					type="button"
					className="relative"
					disabled={disabled}
					onClick={() => onSelect(id)}
				>
					<PublicIcon src={icon} className="size-4" />
					{label}
					{lastUsedMethod === id ? (
						<Badge className="absolute -top-2 -right-2" variant="secondary">
							Last used
						</Badge>
					) : null}
				</Button>
			))}
		</div>
	);
}
