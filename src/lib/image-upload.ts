/**
 * Client-side helper for Passport image assets. All dashboard image uploads use
 * the existing profile image Worker route; the purpose controls the storage
 * folder only, while ownership and final assignment are handled by the caller.
 */
export type ImageUploadPurpose = "organization-logo" | "team-logo" | "application-picture";

type ImageUploadResponse = {
	image?: string;
	url?: string;
	error?: string;
};

const imageUploadResponseSchema = z.object({
	image: z.string().optional(),
	url: z.string().optional(),
	error: z.string().optional(),
});

async function readImageUploadResponse(response: Response): Promise<ImageUploadResponse> {
	try {
		return imageUploadResponseSchema.parse(await response.json());
	} catch {
		return {};
	}
}

async function uploadImageFile(
	file: File,
	purpose: ImageUploadPurpose | undefined,
	failureMessage: string,
) {
	const body = new FormData();
	if (purpose) body.set("purpose", purpose);
	body.set("image", file);

	const response = await fetch("/api/profile-images", {
		method: "POST",
		body,
	});
	const payload = await readImageUploadResponse(response);
	if (!response.ok) {
		throw new Error(payload.error ?? failureMessage);
	}

	const image = payload.image ?? payload.url;
	if (!image) {
		throw new Error("Image upload did not return a URL.");
	}
	// The Worker can return a same-origin path. OAuth client metadata is consumed
	// outside this page, so store the fully qualified Passport URL instead.
	const origin = globalThis.location?.origin ?? "http://localhost";
	return new URL(image, origin).toString();
}

export async function uploadImageAsset(file: File, purpose: ImageUploadPurpose) {
	return uploadImageFile(file, purpose, "Could not upload image.");
}

export async function uploadProfileImageAsset(file: File) {
	return uploadImageFile(file, undefined, "Could not upload profile picture.");
}
import * as z from "zod";
