import { createContext, use, useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FieldContextValue {
	id: string;
	describedBy?: string;
	invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useField() {
	const context = use(FieldContext);
	if (!context) {
		throw new Error("Field.* components must be used within <Field>");
	}
	return context;
}

/**
 * Composable form field. Owns the generated id and wires label, optional hint,
 * and error message together via aria-describedby / aria-invalid so every
 * control is announced correctly. Compose the control as a child:
 *
 *   <Field label="Email" hint="Used to sign in">
 *     <FieldInput type="email" autoComplete="email" required />
 *   </Field>
 */
export function Field({
	label,
	hint,
	error,
	children,
	className,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const id = useId();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;
	const invalid = Boolean(error);
	const describedBy =
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

	return (
		<FieldContext value={{ id, describedBy, invalid }}>
			<div className={cn("space-y-1.5", className)}>
				<Label htmlFor={id}>{label}</Label>
				{children}
				{hint && !error ? (
					<p id={hintId} className="text-xs text-muted-foreground">
						{hint}
					</p>
				) : null}
				{error ? (
					<p id={errorId} className="text-xs font-medium text-destructive">
						{error}
					</p>
				) : null}
			</div>
		</FieldContext>
	);
}

/** shadcn Input pre-wired to the surrounding Field's id and ARIA state. */
export function FieldInput(props: React.ComponentProps<typeof Input>) {
	const { id, describedBy, invalid } = useField();
	return (
		<Input
			id={id}
			aria-describedby={describedBy}
			aria-invalid={invalid || undefined}
			{...props}
		/>
	);
}

/**
 * Password input pre-wired to the Field id/ARIA state with a built-in reveal
 * toggle. The toggle is keyboard reachable and announces its state; the input
 * keeps room on the right so long values never slide under the icon.
 */
export function FieldPasswordInput({
	className,
	...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
	const { id, describedBy, invalid } = useField();
	const [visible, setVisible] = useState(false);
	return (
		<div className="relative">
			<Input
				id={id}
				type={visible ? "text" : "password"}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				className={cn("pr-10", className)}
				{...props}
			/>
			<button
				type="button"
				onClick={() => setVisible((current) => !current)}
				aria-label={visible ? "Hide password" : "Show password"}
				aria-pressed={visible}
				className="absolute top-1/2 right-0 grid size-10 -translate-y-1/2 place-items-center text-muted-foreground transition-[color,scale] duration-150 ease-out hover:text-foreground active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				<span className="relative grid size-4 place-items-center">
					<span
						aria-hidden="true"
						className={cn(
							"absolute inset-0 grid place-items-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
							visible ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
						)}
					>
						<EyeOff className="size-4" />
					</span>
					<span
						aria-hidden="true"
						className={cn(
							"absolute inset-0 grid place-items-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
							visible ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
						)}
					>
						<Eye className="size-4" />
					</span>
				</span>
			</button>
		</div>
	);
}

/** shadcn Textarea pre-wired to the surrounding Field's id and ARIA state. */
export function FieldTextarea(props: React.ComponentProps<typeof Textarea>) {
	const { id, describedBy, invalid } = useField();
	return (
		<Textarea
			id={id}
			aria-describedby={describedBy}
			aria-invalid={invalid || undefined}
			{...props}
		/>
	);
}

/**
 * Standalone labelled checkbox row. Not part of a <Field>; owns its own id and
 * pairs a shadcn Checkbox with a clickable label and optional hint.
 */
export function CheckboxField({
	checked,
	onCheckedChange,
	label,
	hint,
	disabled,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: ReactNode;
	hint?: ReactNode;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className="flex min-h-10 items-start gap-2.5">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheckedChange(value === true)}
				className="mt-0.5"
			/>
			<Label htmlFor={id} className="font-normal leading-snug">
				{label}
				{hint ? (
					<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span>
				) : null}
			</Label>
		</div>
	);
}
