/**
 * Cloudflare request-location helpers. Inputs are Workers `request.cf` metadata
 * snapshots or stored JSON values; outputs are coarse, display-safe location
 * records for sessions and audit events. Add fields here only when they are
 * safe to persist and useful for operator or account-security workflows.
 */
export type RequestLocation = {
	asn?: number;
	asOrganization?: string;
	city?: string;
	colo?: string;
	continent?: string;
	country?: string;
	isEUCountry?: boolean;
	region?: string;
	regionCode?: string;
	timezone?: string;
};

type RequestWithCloudflareMetadata = Request & {
	cf?: unknown;
};

const STRING_FIELDS = [
	"asOrganization",
	"city",
	"colo",
	"continent",
	"country",
	"region",
	"regionCode",
	"timezone",
] as const satisfies readonly (keyof RequestLocation)[];

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(source: Record<string, unknown>, key: (typeof STRING_FIELDS)[number]) {
	const value = source[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(source: Record<string, unknown>, key: "asn") {
	const value = source[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanEUField(source: Record<string, unknown>) {
	const value = source.isEUCountry;
	if (value === true || value === "1") return true;
	return undefined;
}

function hasLocationValue(location: RequestLocation) {
	return Object.values(location).some((value) => value !== undefined);
}

export function parseRequestLocation(value: unknown): RequestLocation | null {
	const source = typeof value === "string" ? parseJSONRecord(value) : value;
	if (!isRecord(source)) return null;

	const location: RequestLocation = {};
	for (const key of STRING_FIELDS) {
		const fieldValue = stringField(source, key);
		if (fieldValue !== undefined) location[key] = fieldValue;
	}

	const asn = numberField(source, "asn");
	if (asn !== undefined) location.asn = asn;

	const isEUCountry = booleanEUField(source);
	if (isEUCountry !== undefined) location.isEUCountry = isEUCountry;

	return hasLocationValue(location) ? location : null;
}

export function requestLocationFromRequest(request?: Request | null): RequestLocation | null {
	if (!request) return null;
	return parseRequestLocation((request as RequestWithCloudflareMetadata).cf);
}

export function formatRequestLocation(value: unknown) {
	const location = parseRequestLocation(value);
	if (!location) return null;

	const region = location.regionCode ?? location.region;
	const parts = [location.city, region, location.country].filter(Boolean);
	if (parts.length > 0) return parts.join(", ");
	return location.timezone ?? null;
}

function parseJSONRecord(value: string) {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}
