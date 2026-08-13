/**
 * Passport's loading boundary uses Kumo's animated line and the active theme's
 * muted surface, so placeholders remain visible in both color modes.
 */
import * as React from "react";
import { SkeletonLine as KumoSkeletonLine, cn } from "@cloudflare/kumo";

function Skeleton({ className, ...props }: React.ComponentProps<typeof KumoSkeletonLine>) {
	return <KumoSkeletonLine data-slot="skeleton" className={cn("!bg-muted", className)} {...props} />;
}

export { Skeleton };
