import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadImageAsset, uploadProfileImageAsset } from "./image-upload";

describe("uploadImageAsset", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("throws a controlled message when an upload failure is not JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("edge failure", { status: 502 })),
		);

		const file = new File(["image"], "avatar.png", { type: "image/png" });

		await expect(uploadImageAsset(file, "organization-logo")).rejects.toThrow(
			"Could not upload image.",
		);
	});

	it("uploads profile images without adding an asset purpose", async () => {
		let uploadedBody: BodyInit | null | undefined;
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			uploadedBody = init?.body;
			return Response.json({ image: "/api/profile-images/profile-images/user/avatar.png" });
		});
		vi.stubGlobal("fetch", fetchMock);

		const file = new File(["image"], "avatar.png", { type: "image/png" });

		await expect(uploadProfileImageAsset(file)).resolves.toBe(
			"http://localhost/api/profile-images/profile-images/user/avatar.png",
		);
		expect(uploadedBody).toBeInstanceOf(FormData);
		expect((uploadedBody as FormData).get("image")).toBe(file);
		expect((uploadedBody as FormData).has("purpose")).toBe(false);
	});
});
