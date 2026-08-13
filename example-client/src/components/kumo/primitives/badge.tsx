/** Kumo-backed metadata badge for the example client. */
import * as React from "react";
import { Badge as KumoBadge } from "@cloudflare/kumo";

function Badge({ variant = "default", ...props }: Omit<React.ComponentProps<typeof KumoBadge>, "variant"> & { variant?: "default" | "secondary" | "destructive" | "outline" }) {
	return <KumoBadge variant={variant === "default" ? "primary" : variant} {...props} />;
}

export { Badge };
