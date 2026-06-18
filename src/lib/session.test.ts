import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	signOut: vi.fn(),
	assign: vi.fn(),
}));

vi.mock("@/auth-client", () => ({
	authClient: {
		signOut: mocks.signOut,
		useSession: vi.fn(),
	},
}));

import { signOut } from "./session";

describe("signOut", () => {
	beforeEach(() => {
		mocks.signOut.mockReset();
		mocks.assign.mockReset();
		vi.stubGlobal("window", {
			location: {
				assign: mocks.assign,
			},
		});
	});

	it("signs out and returns to sign-in without a browser confirmation", async () => {
		await signOut();

		expect(mocks.signOut).toHaveBeenCalledOnce();
		expect(mocks.assign).toHaveBeenCalledWith("/sign-in?signedOut=1");
	});
});
