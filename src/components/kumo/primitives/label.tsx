/** Passport labels keep Kumo semantics and Passport's compact form rhythm. */
import * as React from "react";
import { Label as KumoLabel, cn } from "@cloudflare/kumo";

function Label({ className, ...props }: React.ComponentProps<typeof KumoLabel>) {
	return <KumoLabel className={cn("inline-flex text-sm font-medium text-foreground", className)} {...props} />;
}

export { Label };
