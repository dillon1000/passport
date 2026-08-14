/**
 * Passport's loading boundary uses Kumo's animated line and the active theme's
 * muted surface and control radius, so placeholders remain visible and match
 * Passport's geometry in both color modes. Callers can still supply a more
 * specific radius for circular or card-shaped placeholders.
 */
import * as React from "react";
import { SkeletonLine as KumoSkeletonLine, cn } from "@cloudflare/kumo";

function Skeleton({ className, ...props }: React.ComponentProps<typeof KumoSkeletonLine>) {
	return <KumoSkeletonLine data-slot="skeleton" className={cn("!bg-muted rounded-lg", className)} {...props} />;
}

export { Skeleton };
