/**
 * Passport empty states use Kumo Empty for a single accessible structure while
 * retaining the application's compact card spacing and active color theme.
 */
import * as React from "react";
import { Empty as KumoEmpty, cn } from "@cloudflare/kumo";

function Empty({ className, icon, ...props }: React.ComponentProps<typeof KumoEmpty>) {
	return <KumoEmpty
		icon={icon ? <div className="grid size-11 place-items-center rounded-full border bg-muted/50 text-muted-foreground">{icon}</div> : undefined}
		className={cn("!gap-3 !rounded-lg !border-0 !bg-transparent !px-4 !py-12 text-center [&>h2]:!text-sm [&>h2]:!font-medium [&>p]:!max-w-sm [&>p]:!text-sm", className)}
		{...props}
	/>;
}

export { Empty };
