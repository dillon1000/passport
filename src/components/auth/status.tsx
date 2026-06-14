import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export type StatusTone = "error" | "success";

export interface Status {
	tone: StatusTone;
	message: string;
}

/**
 * Persistent ARIA live region. The wrapper is always mounted so screen readers
 * announce the message when it appears; errors are assertive, confirmations
 * polite. Pass `null` when there is nothing to report.
 */
export function StatusBanner({ status }: { status: Status | null }) {
	const isError = status?.tone === "error";
	return (
		<div
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
			className="empty:hidden"
		>
			{status ? (
				<Alert variant={isError ? "destructive" : "default"}>
					{isError ? <TriangleAlert /> : <CheckCircle2 />}
					<AlertDescription className={isError ? "text-destructive/90" : undefined}>
						{status.message}
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}
