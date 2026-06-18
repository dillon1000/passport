import { describe, expect, it } from "vitest";

import {
	formatRequestLocation,
	parseRequestLocation,
	requestLocationFromRequest,
} from "./request-location";

describe("request location helpers", () => {
	it("builds a coarse location snapshot from Cloudflare request metadata", () => {
		const request = new Request("https://passport.test") as Request & {
			cf?: Record<string, unknown>;
		};
		request.cf = {
			asn: 395747,
			asOrganization: "Google Cloud",
			city: "Austin",
			colo: "DFW",
			continent: "NA",
			country: "US",
			latitude: "30.27130",
			longitude: "-97.74260",
			postalCode: "78701",
			region: "Texas",
			regionCode: "TX",
			timezone: "America/Chicago",
		};

		expect(requestLocationFromRequest(request)).toEqual({
			asn: 395747,
			asOrganization: "Google Cloud",
			city: "Austin",
			colo: "DFW",
			continent: "NA",
			country: "US",
			region: "Texas",
			regionCode: "TX",
			timezone: "America/Chicago",
		});
	});

	it("returns null when Cloudflare location metadata is unavailable", () => {
		expect(requestLocationFromRequest(new Request("https://passport.test"))).toBeNull();
		expect(parseRequestLocation(null)).toBeNull();
	});

	it("formats available location parts for session and audit display", () => {
		expect(
			formatRequestLocation({
				city: "Austin",
				regionCode: "TX",
				country: "US",
			}),
		).toBe("Austin, TX, US");
		expect(formatRequestLocation({ country: "US" })).toBe("US");
		expect(formatRequestLocation({})).toBeNull();
		expect(formatRequestLocation({ asOrganization: "Google Cloud", colo: "DFW" })).toBeNull();
	});
});
