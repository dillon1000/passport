/** Passport's resizable field control backed by Kumo's accessible textarea. */
import * as React from "react";
import { Textarea as KumoTextarea, cn } from "@cloudflare/kumo";

function Textarea({ className, ...props }: React.ComponentProps<typeof KumoTextarea>) {
	return (
		<KumoTextarea
			className={cn(
				"!block !min-h-16 !w-full !rounded-lg !border !border-input !bg-transparent !px-2.5 !py-2 !text-sm !text-foreground placeholder:!text-muted-foreground focus-visible:!border-ring focus-visible:!ring-3 focus-visible:!ring-ring/50 disabled:!bg-muted disabled:!opacity-50 aria-invalid:!border-destructive aria-invalid:!ring-3 aria-invalid:!ring-destructive/20",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
