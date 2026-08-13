/** Passport's compact field control backed by Kumo's accessible input. */
import * as React from "react";
import { Input as KumoInput, cn } from "@cloudflare/kumo";

function Input({ className, ...props }: React.ComponentProps<typeof KumoInput>) {
	return (
		<KumoInput
			className={cn(
				"!h-9 !w-full !min-w-0 !rounded-lg !border !border-input !bg-background !px-3 !py-1 !text-sm !text-foreground shadow-xs transition-[color,box-shadow,border-color] placeholder:!text-muted-foreground hover:!border-ring/60 focus-visible:!border-ring focus-visible:!ring-3 focus-visible:!ring-ring/35 disabled:!bg-muted disabled:!opacity-50 aria-invalid:!border-destructive aria-invalid:!ring-3 aria-invalid:!ring-destructive/20",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
