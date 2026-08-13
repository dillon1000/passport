/** Passport status variants mapped to Kumo's semantic badge variants. */
import * as React from "react";
import { Badge as KumoBadge, cn } from "@cloudflare/kumo";

type BadgeProps = Omit<React.ComponentProps<typeof KumoBadge>, "variant"> & {
	variant?: "default" | "secondary" | "destructive" | "outline";
};

function Badge({ variant = "default", className, ...props }: BadgeProps) {
	const kumoVariant = variant === "default" ? "neutral" : variant === "destructive" ? "error" : variant;
	return <KumoBadge variant={kumoVariant} className={cn("!rounded-full !text-[0.6875rem] !font-medium", className)} {...props} />;
}

export { Badge };
