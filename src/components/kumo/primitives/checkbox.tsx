/**
 * Passport checkbox keeps Kumo interaction behavior and maps its visual state
 * to the active Passport theme. The wrapper accepts the existing DOM id hook.
 */
import * as React from "react";
import { Checkbox as KumoCheckbox, cn } from "@cloudflare/kumo";

type CheckboxProps = React.ComponentProps<typeof KumoCheckbox> & { id?: string };
const KumoCheckboxCompat = KumoCheckbox as React.ComponentType<CheckboxProps>;

function Checkbox({ className, ...props }: CheckboxProps) {
	return <KumoCheckboxCompat className={cn(
		"!rounded-[4px] !border !border-input !bg-background !ring-0 data-[checked]:!rounded-[4px] data-[checked]:!border-primary data-[checked]:!bg-primary data-[checked]:!text-primary-foreground data-[indeterminate]:!rounded-[4px] data-[indeterminate]:!border-primary data-[indeterminate]:!bg-primary focus-visible:!ring-3 focus-visible:!ring-ring/50 disabled:!opacity-60",
		className,
	)} {...props} />;
}

export { Checkbox };
