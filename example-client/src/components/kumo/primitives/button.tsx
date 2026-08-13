/** Kumo-backed action control for the example client. */
import * as React from "react";
import { Button as KumoButton, cn } from "@cloudflare/kumo";

type ButtonProps = Omit<React.ComponentProps<typeof KumoButton>, "variant" | "size"> & {
	asChild?: boolean;
	variant?: "default" | "secondary" | "ghost" | "destructive" | "outline";
	size?: "default" | "sm" | "lg";
};

const KumoButtonCompat = KumoButton as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>;

function Button({ asChild = false, children, className, variant = "default", size = "default", ...props }: ButtonProps) {
	const kumoProps = { ...props, className: cn(className), variant: variant === "default" ? "primary" : variant, size: size === "default" ? "base" : size };
	if (asChild && React.isValidElement(children)) return React.cloneElement(children, kumoProps);
	return <KumoButtonCompat {...kumoProps}>{children}</KumoButtonCompat>;
}

export { Button };
