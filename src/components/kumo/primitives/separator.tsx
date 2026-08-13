/** Kumo separator with Passport's existing orientation convenience prop. */
import * as React from "react";
import { Separator as KumoSeparator } from "@cloudflare/kumo/primitives/separator";

function Separator(props: React.ComponentProps<typeof KumoSeparator>) {
	return <KumoSeparator {...props} />;
}

export { Separator };
