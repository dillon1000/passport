/**
 * Request metadata normalization for account-security and privacy workflows.
 * Inputs are Cloudflare Worker requests; outputs are coarse browser, operating
 * system, network, location, and timestamp fields that are safe to show in
 * emails and account activity screens. Add fields only when they help a user
 * recognize whether an account action was theirs.
 */
import {
	formatRequestLocation,
	requestLocationFromRequest,
	type RequestLocation,
} from "./request-location";
import { parseUserAgent } from "./sessions";

export type RequestMetadata = {
	browser: string;
	device: string;
	ipAddress?: string | null;
	location?: RequestLocation | null;
	locationLabel: string;
	operatingSystem: string;
	time: string;
	userAgent?: string | null;
};

export function requestIPAddress(request?: Request | null) {
	if (!request) return null;
	return (
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		null
	);
}

export function requestMetadataFromRequest(
	request?: Request | null,
	now: Date = new Date(),
): RequestMetadata {
	const userAgent = request?.headers.get("user-agent") ?? null;
	const parsedAgent = parseUserAgent(userAgent);
	const location = requestLocationFromRequest(request);
	return {
		browser: parsedAgent.browser || "Unknown browser",
		device: parsedAgent.label,
		ipAddress: requestIPAddress(request),
		location,
		locationLabel: formatRequestLocation(location) ?? "Unknown location",
		operatingSystem: parsedAgent.os || "Unknown operating system",
		time: now.toISOString(),
		userAgent,
	};
}

export function requestMetadataText(metadata: RequestMetadata) {
	return [
		`Time: ${new Date(metadata.time).toLocaleString()}`,
		`Browser: ${metadata.browser}`,
		`Operating system: ${metadata.operatingSystem}`,
		`Device: ${metadata.device}`,
		`Location: ${metadata.locationLabel}`,
		metadata.ipAddress ? `IP address: ${metadata.ipAddress}` : null,
	]
		.filter(Boolean)
		.join("\n");
}
