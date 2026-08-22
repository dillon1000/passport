import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
	signOut: vi.fn(),
	assign: vi.fn(),
};

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
		await signOut({ signOut: mocks.signOut, redirect: mocks.assign });

		expect(mocks.signOut).toHaveBeenCalledOnce();
		expect(mocks.assign).toHaveBeenCalledWith("/sign-in?signedOut=1");
	});
});
