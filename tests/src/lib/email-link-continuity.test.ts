import { afterEach, describe, expect, it, vi } from "vitest";

import {
	cancelEmailLinkFlow,
	emailLinkPollDelay,
	pollEmailLinkFlow,
	startEmailLinkFlow,
} from "./email-link-continuity";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("startEmailLinkFlow", () => {
	it("creates a flow with the email kind and original destination", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				flow: "a".repeat(64),
				callbackURL: `https://passport.test/api/auth/email-link/consume?flow=${"a".repeat(64)}`,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(startEmailLinkFlow("magic-link", "/account")).resolves.toMatchObject({
			flow: "a".repeat(64),
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/auth/email-link/start",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ kind: "magic-link", destination: "/account" }),
			}),
		);
	});
});

describe("pollEmailLinkFlow", () => {
	it("returns the continuation after another device consumes the link", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({ status: "complete", destination: "/account" }),
			),
		);

		await expect(pollEmailLinkFlow("flow-token")).resolves.toEqual({
			status: "complete",
			destination: "/account",
		});
	});

	it("classifies an expired flow without exposing a server error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 410 })));

		await expect(pollEmailLinkFlow("expired-flow")).resolves.toEqual({ status: "expired" });
	});
});

describe("cancelEmailLinkFlow", () => {
	it("removes an unused flow", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await cancelEmailLinkFlow("unused-flow");

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/auth/email-link/cancel?flow=unused-flow",
			expect.objectContaining({ method: "DELETE" }),
		);
	});
});

describe("emailLinkPollDelay", () => {
	it("backs off old waiting tabs while fresh links remain immediate", () => {
		expect(emailLinkPollDelay(0)).toBe(1_000);
		expect(emailLinkPollDelay(2 * 60 * 1_000)).toBe(3_000);
		expect(emailLinkPollDelay(10 * 60 * 1_000)).toBe(10_000);
	});
});
