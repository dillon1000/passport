/**
 * Compact account-selection row shared by sign-in and OAuth account choice.
 * The account record supplies the visible identity; callers own selection,
 * disabled state, and any short trailing status such as "Current".
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { initialsOf } from "@/lib/session";

export function AccountChoice({
	account,
	label,
	status,
	disabled,
	onChoose,
}: {
	account: { name: string; email: string; image?: string | null };
	label?: string;
	status?: string;
	disabled: boolean;
	onChoose: () => void;
}) {
	return (
		<button
			type="button"
			className="flex min-h-14 w-full items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
			disabled={disabled}
			onClick={onChoose}
		>
			<Avatar className="size-8">
				<AvatarImage src={account.image ?? undefined} />
				<AvatarFallback className="text-xs">{initialsOf(account.name)}</AvatarFallback>
			</Avatar>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{label ?? account.name}</span>
				<span className="block truncate text-xs text-muted-foreground">{account.email}</span>
			</span>
			{status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
		</button>
	);
}
