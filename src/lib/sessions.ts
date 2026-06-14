export type SessionSummary = {
	token?: string | null;
	ipAddress?: string | null;
	userAgent?: string | null;
};

export function isCurrentSession(session: SessionSummary, currentToken?: string | null) {
	return Boolean(currentToken && session.token === currentToken);
}

export function describeSession(session: SessionSummary) {
	const userAgent = session.userAgent ?? "";
	let label = parseUserAgent(userAgent).label;
	if (/macintosh/i.test(userAgent)) label = "Macintosh";
	else if (/iphone|ipod/i.test(userAgent)) label = "iPhone";
	else if (/ipad/i.test(userAgent)) label = "iPad";
	else if (/android/i.test(userAgent)) label = "Android";
	else if (/windows/i.test(userAgent)) label = "Windows";
	const ipAddress = session.ipAddress?.trim();
	if (label === "Unknown device") return ipAddress ? `Unknown device from ${ipAddress}` : label;
	return ipAddress ? `${label} from ${ipAddress}` : label;
}

export type DeviceType = "desktop" | "mobile" | "tablet";

export interface ParsedAgent {
	browser: string;
	os: string;
	deviceType: DeviceType;
	/** Human label like "Chrome on macOS". */
	label: string;
}

/** Best-effort, dependency-free user-agent parsing for display only. */
export function parseUserAgent(userAgent?: string | null): ParsedAgent {
	const ua = userAgent ?? "";

	let os = "";
	if (/iphone|ipod/i.test(ua)) os = "iOS";
	else if (/ipad/i.test(ua)) os = "iPadOS";
	else if (/android/i.test(ua)) os = "Android";
	else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
	else if (/windows/i.test(ua)) os = "Windows";
	else if (/cros/i.test(ua)) os = "ChromeOS";
	else if (/linux/i.test(ua)) os = "Linux";

	let browser = "";
	if (/edg\//i.test(ua)) browser = "Edge";
	else if (/opr\/|opera/i.test(ua)) browser = "Opera";
	else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
	else if (/crios|chrome|chromium/i.test(ua)) browser = "Chrome";
	else if (/safari/i.test(ua)) browser = "Safari";

	let deviceType: DeviceType = "desktop";
	if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) deviceType = "tablet";
	else if (/iphone|ipod|mobile/i.test(ua)) deviceType = "mobile";

	let label: string;
	if (browser && os) label = `${browser} on ${os}`;
	else label = browser || os || "Unknown device";

	return { browser, os, deviceType, label };
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 31_536_000_000],
	["month", 2_592_000_000],
	["week", 604_800_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

/** "3 hours ago", "in 5 days", "just now". */
export function relativeTime(value?: string | Date | null) {
	if (!value) return "unknown";
	const diff = new Date(value).getTime() - Date.now();
	const abs = Math.abs(diff);
	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	for (const [unit, ms] of RELATIVE_UNITS) {
		if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
	}
	return "just now";
}
