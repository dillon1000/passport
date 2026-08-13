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
		"[&>span]:!border [&>span]:!border-input [&>span]:!bg-background [&>span]:!ring-0 [&>span]:data-[checked]:!border-primary [&>span]:data-[checked]:!bg-primary [&>span]:data-[checked]:!text-primary-foreground [&>span]:data-[indeterminate]:!border-primary [&>span]:data-[indeterminate]:!bg-primary [&>span]:focus-visible:!ring-3 [&>span]:focus-visible:!ring-ring/50 disabled:!opacity-60",
		className,
	)} {...props} />;
}

export { Checkbox };
