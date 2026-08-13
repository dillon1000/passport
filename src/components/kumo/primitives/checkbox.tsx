/** Kumo checkbox with the DOM id hook required by Passport's Field labels. */
import * as React from "react";
import { Checkbox as KumoCheckbox } from "@cloudflare/kumo";

type CheckboxProps = React.ComponentProps<typeof KumoCheckbox> & { id?: string };
const KumoCheckboxCompat = KumoCheckbox as React.ComponentType<CheckboxProps>;

function Checkbox(props: CheckboxProps) {
	return <KumoCheckboxCompat {...props} />;
}

export { Checkbox };
