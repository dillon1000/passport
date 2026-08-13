/** Kumo Banner feedback surface with Passport's small composition slots. */
import * as React from "react";
import { Banner } from "@cloudflare/kumo";

function Alert({ variant = "default", children, ...props }: Omit<React.ComponentProps<typeof Banner>, "variant"> & { variant?: "default" | "destructive" }) {
	return <Banner variant={variant === "destructive" ? "error" : "secondary"} size="sm" {...props}>{children}</Banner>;
}
function AlertDescription(props: React.ComponentProps<"span">) { return <span {...props} />; }
export { Alert, AlertDescription };
