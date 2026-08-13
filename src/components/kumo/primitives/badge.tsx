/** Passport status variants mapped to Kumo's semantic badge variants. */
import * as React from "react";
import { Badge as KumoBadge } from "@cloudflare/kumo";

type BadgeProps = Omit<React.ComponentProps<typeof KumoBadge>, "variant"> & {
	variant?: "default" | "secondary" | "destructive" | "outline";
};

function Badge({ variant = "default", ...props }: BadgeProps) {
	return <KumoBadge variant={variant === "default" ? "primary" : variant} {...props} />;
}

export { Badge };
