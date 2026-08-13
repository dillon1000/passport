/**
 * Passport's action API delegates rendering, focus treatment, and loading
 * behavior to Kumo. `asChild` remains for router links used by existing flows.
 */
import * as React from "react";

import { Button as KumoButton, cn } from "@cloudflare/kumo";

type PassportButtonProps = Omit<React.ComponentProps<typeof KumoButton>, "variant" | "size"> & {
	asChild?: boolean;
	variant?: "default" | "secondary" | "ghost" | "destructive" | "outline" | "link";
	size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm";
};

const variantMap = {
	default: "primary",
	secondary: "secondary",
	ghost: "ghost",
	destructive: "destructive",
	outline: "outline",
	link: "ghost",
} as const;

const sizeMap = { default: "base", xs: "xs", sm: "sm", lg: "lg", icon: "base", "icon-xs": "xs", "icon-sm": "sm" } as const;

// Kumo's icon-only overload requires a title even when Passport supplies a
// visible child at runtime, so this local view exposes the shared button API.
const KumoButtonCompat = KumoButton as React.ComponentType<
	React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }
>;

const Button = React.forwardRef<HTMLButtonElement, PassportButtonProps>(
	({ asChild = false, className, variant = "default", size = "default", children, ...props }, ref) => {
		void ref;
		const kumoProps = {
			...props,
			className: cn(size === "icon" && "size-9 p-0", className),
			variant: variantMap[variant] as React.ComponentProps<typeof KumoButton>["variant"],
			size: sizeMap[size] as React.ComponentProps<typeof KumoButton>["size"],
		};

		if (asChild && React.isValidElement(children)) {
			return React.cloneElement(children, kumoProps);
		}

		return <KumoButtonCompat {...kumoProps}>{children}</KumoButtonCompat>;
	},
);
Button.displayName = "Button";

export { Button };
