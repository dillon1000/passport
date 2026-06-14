import type { ComponentType, SVGProps } from "react";

import { Button } from "@/components/ui/button";

/** OAuth providers wired in `auth.ts`. Extend by adding an entry here. */
export type SocialProviderId = "github" | "discord" | "twitter";

interface SocialProvider {
	id: SocialProviderId;
	label: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

function GitHubIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56v-2.1c-3.34.71-4.04-1.4-4.04-1.4-.55-1.36-1.34-1.72-1.34-1.72-1.09-.72.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.78 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.29-5.47-1.29-5.47-5.75 0-1.27.47-2.31 1.23-3.12-.12-.29-.53-1.46.12-3.05 0 0 1-.31 3.3 1.19a11.6 11.6 0 0 1 6 0c2.3-1.5 3.3-1.19 3.3-1.19.65 1.59.24 2.76.12 3.05.77.81 1.23 1.85 1.23 3.12 0 4.47-2.81 5.45-5.49 5.74.43.36.81 1.08.81 2.18v3.23c0 .31.21.68.83.56A11.8 11.8 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z" />
		</svg>
	);
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M20.32 4.37A19.8 19.8 0 0 0 15.45 2.9a.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.24a18.3 18.3 0 0 0-5.48 0 12 12 0 0 0-.62-1.24.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.7 4.37a.07.07 0 0 0-.03.03C.55 9.09-.32 13.68.1 18.22a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.04.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11c-.65-.25-1.27-.55-1.87-.89a.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.01-3.04.08.08 0 0 0 .03-.05c.5-5.25-.84-9.8-3.54-13.82a.06.06 0 0 0-.03-.03ZM8.02 15.45c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
		</svg>
	);
}

function XIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.3L17.61 20.65Z" />
		</svg>
	);
}

const providers: SocialProvider[] = [
	{ id: "github", label: "GitHub", Icon: GitHubIcon },
	{ id: "discord", label: "Discord", Icon: DiscordIcon },
	{ id: "twitter", label: "X", Icon: XIcon },
];

export function SocialButtons({
	onSelect,
	disabled,
}: {
	onSelect: (provider: SocialProviderId) => void;
	disabled?: boolean;
}) {
	return (
		<div className="grid grid-cols-3 gap-2">
			{providers.map(({ id, label, Icon }) => (
				<Button
					key={id}
					variant="outline"
					type="button"
					disabled={disabled}
					onClick={() => onSelect(id)}
				>
					<Icon className="size-4" />
					{label}
				</Button>
			))}
		</div>
	);
}
