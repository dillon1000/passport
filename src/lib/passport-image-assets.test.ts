/** Storage rollback, cleanup, validation, and URL tests for delegated images. */
import { describe, expect, it, vi } from "vitest";

import { DelegatedResourceError } from "./delegated-resource-errors";
import {
	PASSPORT_IMAGE_MAX_BYTES,
	createPassportImageAssetService,
	passportOwnedImageKey,
} from "./passport-image-assets";

function imageStorage() {
	return {
		put: vi.fn(async () => null),
		delete: vi.fn(async () => undefined),
	};
}

describe("Passport image assets", () => {
	it("assigns an absolute URL and removes the replaced Passport-owned object", async () => {
		const storage = imageStorage();
		const service = createPassportImageAssetService({
			origin: "https://passport.test",
			storage,
			generateID: () => "image_1",
		});
		const image = await service.assignImage({
			file: new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }),
			ownerID: "user_1",
			purpose: "profile",
			assign: async (url) => {
				expect(url).toBe(
					"https://passport.test/api/profile-images/profile-images/user_1/profile/image_1.png",
				);
				return "/api/profile-images/profile-images/user_1/profile/old.png";
			},
		});
		expect(image).toBe(
			"https://passport.test/api/profile-images/profile-images/user_1/profile/image_1.png",
		);
		expect(storage.put).toHaveBeenCalledOnce();
		expect(storage.delete).toHaveBeenCalledWith("profile-images/user_1/profile/old.png");
	});

	it("rolls back the new object when database assignment fails", async () => {
		const storage = imageStorage();
		const service = createPassportImageAssetService({
			origin: "https://passport.test",
			storage,
			generateID: () => "image_2",
		});
		await expect(
			service.assignImage({
				file: new File([new Uint8Array([1])], "avatar.webp", { type: "image/webp" }),
				ownerID: "user_1",
				purpose: "profile",
				assign: async () => {
					throw new Error("database unavailable");
				},
			}),
		).rejects.toThrow("database unavailable");
		expect(storage.delete).toHaveBeenCalledWith(
			"profile-images/user_1/profile/image_2.webp",
		);
	});

	it("rejects unsupported and oversized files before storage", async () => {
		const storage = imageStorage();
		const service = createPassportImageAssetService({
			origin: "https://passport.test",
			storage,
		});
		await expect(
			service.assignImage({
				file: new File(["svg"], "avatar.svg", { type: "image/svg+xml" }),
				ownerID: "user_1",
				purpose: "profile",
				assign: async () => null,
			}),
		).rejects.toMatchObject({ code: "invalid_image_type" });
		await expect(
			service.assignImage({
				file: new File([new Uint8Array(PASSPORT_IMAGE_MAX_BYTES + 1)], "large.jpg", {
					type: "image/jpeg",
				}),
				ownerID: "user_1",
				purpose: "profile",
				assign: async () => null,
			}),
		).rejects.toBeInstanceOf(DelegatedResourceError);
		expect(storage.put).not.toHaveBeenCalled();
	});

	it("never deletes external or lookalike image URLs", () => {
		expect(
			passportOwnedImageKey("https://passport.test", "https://cdn.example/avatar.png"),
		).toBeNull();
		expect(
			passportOwnedImageKey(
				"https://passport.test",
				"https://passport.test/api/profile-images/unowned/avatar.png",
			),
		).toBeNull();
	});
});
