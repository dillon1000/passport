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

export async function uploadImageAsset(file: File, purpose: ImageUploadPurpose) {
	const body = new FormData();
	body.set("purpose", purpose);
	body.set("image", file);

	const response = await fetch("/api/profile-images", {
		method: "POST",
		body,
	});
	const payload = (await response.json()) as ImageUploadResponse;
	if (!response.ok) {
		throw new Error(payload.error ?? "Could not upload image.");
	}

	const image = payload.image ?? payload.url;
	if (!image) {
		throw new Error("Image upload did not return a URL.");
	}
	return image;
}
