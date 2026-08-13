/**
 * Passport empty states use Kumo Empty for a single accessible structure while
 * retaining the application's compact card spacing and active color theme.
 */
import * as React from "react";
import { Empty as KumoEmpty, cn } from "@cloudflare/kumo";

function Empty({ className, ...props }: React.ComponentProps<typeof KumoEmpty>) {
	return <KumoEmpty className={cn("rounded-lg border border-border bg-muted/20", className)} {...props} />;
}

export { Empty };
