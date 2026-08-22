/** Kumo-backed metadata badge for the example client. */
import type { ReactNode } from "react";
import { Badge as KumoBadge } from "@cloudflare/kumo";

type BadgeProps = {
	children: ReactNode;
	className?: string;
	variant?: "default" | "secondary" | "destructive" | "outline";
};

function Badge({ variant = "default", ...props }: BadgeProps) {
	return <KumoBadge variant={variant === "default" ? "primary" : variant} {...props} />;
}

export { Badge };
