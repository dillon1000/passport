import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/kumo/primitives/dialog";
import { Button } from "@/components/kumo/primitives/button";

export type StatusTone = "error" | "success";

export interface Status {
	tone: StatusTone;
	message: string;
}

/**
 * Shared status outlet. Existing pages can keep setting a Status object while
 * this component routes failures to a modal dialog and confirmations to Sonner
 * toasts, so transient messages do not occupy page layout space.
 */
export function StatusBanner({ status }: { status: Status | null }) {
	const [dismissedStatusKey, setDismissedStatusKey] = useState("");
	const lastStatusKey = useRef("");
	const statusKey = status ? `${status.tone}:${status.message}` : "";
	const errorDialogOpen = status?.tone === "error" && dismissedStatusKey !== statusKey;

	useEffect(() => {
		if (!status) {
			lastStatusKey.current = "";
			return;
		}
		const statusKey = `${status.tone}:${status.message}`;
		if (lastStatusKey.current === statusKey) return;
		lastStatusKey.current = statusKey;

		if (status.tone === "error") return;

		toast.success(status.message, {
			id: statusKey,
		});
	}, [status]);

	return (
		<Dialog
			open={errorDialogOpen}
			onOpenChange={(open) => !open && setDismissedStatusKey(statusKey)}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<TriangleAlert className="size-4 text-destructive" />
						Something went wrong
					</DialogTitle>
					<DialogDescription>{status?.message}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" onClick={() => setDismissedStatusKey(statusKey)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
