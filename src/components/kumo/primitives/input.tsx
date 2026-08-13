/** Passport's compact field control backed by Kumo's accessible input. */
import * as React from "react";
import { Input as KumoInput, cn } from "@cloudflare/kumo";

function Input({ className, ...props }: React.ComponentProps<typeof KumoInput>) {
	return <KumoInput className={cn("!text-sm", className)} {...props} />;
}

export { Input };
