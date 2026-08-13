import * as React from "react";

import { cn } from "@/lib/utils";

// Loading placeholder primitive. Shape and sizing come from caller-provided
// classes; the wave treatment is attached globally through data-slot.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("rounded-md bg-muted", className)}
			{...props}
		/>
	);
}

export { Skeleton };
