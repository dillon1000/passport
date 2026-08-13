/** App-level blocking transition shown while Better Auth changes the active account. */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { Loader } from "@/components/kumo/primitives/loader";
import { useAccountSwitch } from "@/lib/account-switch";
import { initialsOf } from "@/lib/session";

export function AccountSwitchOverlay() {
	const account = useAccountSwitch((state) => state.account);
	if (!account) return null;

	return (
		<div
			className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
			role="status"
			aria-live="assertive"
			aria-label={`Switching to ${account.email}`}
		>
			<div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-xl border bg-card px-6 py-8 text-center shadow-md">
				<Avatar size="lg">
					<AvatarImage src={account.image ?? undefined} />
					<AvatarFallback>{initialsOf(account.name)}</AvatarFallback>
				</Avatar>
				<div className="space-y-1">
					<p className="flex items-center justify-center gap-2 text-sm font-medium">
						<Loader size="sm" />
						Switching accounts
					</p>
					<p className="text-sm text-muted-foreground">Continuing as {account.email}</p>
				</div>
			</div>
		</div>
	);
}
