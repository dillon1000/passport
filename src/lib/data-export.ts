/**
 * Public data-export DTOs shared by Worker routes and the Settings UI. The
 * database stores additional token hashes and R2 details, but those never leave
 * server-side code; clients only receive state, timestamps, and safe metadata.
 */
export const DATA_EXPORT_STATUSES = [
	"pending",
	"processing",
	"completed",
	"canceled",
	"failed",
] as const;

export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

export type DataExportRequestSummary = {
	id: string;
	status: DataExportStatus;
	requestedAt: string;
	cancelableUntil: string;
	canceledAt?: string | null;
	completedAt?: string | null;
	expiresAt?: string | null;
	downloadedAt?: string | null;
	errorMessage?: string | null;
};

export type DataExportWorkflowPayload = {
	requestId: string;
	userId: string;
};
