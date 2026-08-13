/**
 * Confirmation dialog for the ordinary account sign-out action. Callers own
 * the trigger placement; this component owns the confirmation copy and invokes
 * the shared session sign-out helper only after the user confirms.
 */
import { useState } from "react";
import { LogOut } from "@/lib/icons";

import { Button } from "@/components/kumo/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/kumo/primitives/dialog";
import { signOut } from "@/lib/session";

export function SignOutDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [busy, setBusy] = useState(false);

	async function confirmSignOut() {
		setBusy(true);
		try {
			await signOut();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Sign out?</DialogTitle>
					<DialogDescription>
						This ends your session in this browser and returns you to sign-in.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="destructive" type="button" onClick={confirmSignOut} disabled={busy}>
						<LogOut className="size-4" />
						Sign out
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
