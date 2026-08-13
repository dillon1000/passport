/**
 * Passport's action API delegates rendering, focus treatment, and loading
 * behavior to Kumo. `asChild` remains for router links used by existing flows.
 */
import * as React from "react";

import { Button as KumoButton, buttonVariants, cn } from "@cloudflare/kumo";

type PassportButtonProps = Omit<React.ComponentProps<typeof KumoButton>, "variant" | "size"> & {
	asChild?: boolean;
	variant?: "default" | "secondary" | "ghost" | "destructive" | "outline" | "link";
	size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
};

const variantMap = {
	default: "secondary",
	secondary: "secondary",
	ghost: "ghost",
	destructive: "secondary",
	outline: "outline",
	link: "ghost",
} as const;

const sizeMap = { default: "base", xs: "xs", sm: "sm", lg: "lg", icon: "base", "icon-xs": "xs", "icon-sm": "sm", "icon-lg": "lg" } as const;

const variantClasses = {
	default: "!bg-primary !text-primary-foreground shadow-sm shadow-primary/20 hover:!bg-primary/90 active:!bg-primary",
	outline: "!border !border-border !bg-background !text-foreground shadow-xs hover:!bg-muted",
	secondary: "!bg-secondary !text-secondary-foreground hover:!bg-secondary/90",
	ghost: "!bg-transparent !text-foreground hover:!bg-muted",
	destructive: "!border !border-destructive/20 !bg-destructive/10 !text-destructive hover:!bg-destructive/20",
	link: "!bg-transparent !text-primary underline-offset-4 hover:!underline",
} as const;

const sizeClasses = {
	default: "!h-9 !gap-1.5 !rounded-lg !px-3.5 !text-sm",
	xs: "!h-6 !gap-1 !rounded-md !px-2 !text-xs",
	sm: "!h-7 !gap-1 !rounded-md !px-2.5 !text-[0.8rem]",
	lg: "!h-10 !gap-2 !rounded-lg !px-5 !text-[0.9375rem]",
	icon: "!size-8 !rounded-lg !p-0",
	"icon-xs": "!size-6 !rounded-md !p-0",
	"icon-sm": "!size-7 !rounded-md !p-0",
	"icon-lg": "!size-9 !rounded-lg !p-0",
} as const;

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
			"data-slot": "button",
			"data-variant": variant,
			"data-size": size,
			className: cn(
				buttonVariants({ variant: variantMap[variant], size: sizeMap[size] }),
				"relative border-0 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				variantClasses[variant],
				sizeClasses[size],
				className,
			),
			variant: variantMap[variant],
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
