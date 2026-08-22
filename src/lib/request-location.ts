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
	cf?: RequestLocationInput;
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
const requestLocationInputSchema = z.object({
	asn: z.number().finite().optional(),
	asOrganization: z.string().optional(),
	city: z.string().optional(),
	colo: z.string().optional(),
	continent: z.string().optional(),
	country: z.string().optional(),
	isEUCountry: z.union([z.boolean(), z.literal("1")]).optional(),
	region: z.string().optional(),
	regionCode: z.string().optional(),
	timezone: z.string().optional(),
}).passthrough();
type RequestLocationInput = z.input<typeof requestLocationInputSchema>;
type ParsedRequestLocationInput = z.output<typeof requestLocationInputSchema>;

function stringField(source: ParsedRequestLocationInput, key: (typeof STRING_FIELDS)[number]) {
	const value = source[key];
	return value?.trim() || undefined;
}

function numberField(source: ParsedRequestLocationInput) {
	return source.asn;
}

function booleanEUField(source: ParsedRequestLocationInput) {
	const value = source.isEUCountry;
	if (value === true || value === "1") return true;
	return undefined;
}

function hasLocationValue(location: RequestLocation) {
	return Object.values(location).some((value) => value !== undefined);
}

export function parseRequestLocation(value: RequestLocationInput): RequestLocation | null {
	const source = requestLocationInputSchema.safeParse(
		z.string().safeParse(value).success ? parseJSONRecord(value) : value,
	);
	if (!source.success) return null;

	const location: RequestLocation = {};
	for (const key of STRING_FIELDS) {
		const fieldValue = stringField(source.data, key);
		if (fieldValue !== undefined) location[key] = fieldValue;
	}

	const asn = numberField(source.data);
	if (asn !== undefined) location.asn = asn;

	const isEUCountry = booleanEUField(source.data);
	if (isEUCountry !== undefined) location.isEUCountry = isEUCountry;

	return hasLocationValue(location) ? location : null;
}

export function requestLocationFromRequest(request?: RequestWithCloudflareMetadata | null): RequestLocation | null {
	if (!request) return null;
	return parseRequestLocation(request.cf);
}

export function formatRequestLocation(value: RequestLocationInput) {
	const location = parseRequestLocation(value);
	if (!location) return null;

	const region = location.regionCode ?? location.region;
	const parts = [location.city, region, location.country].filter(Boolean);
	if (parts.length > 0) return parts.join(", ");
	return location.timezone ?? null;
}

function parseJSONRecord(value: string) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
import { z } from "zod";
