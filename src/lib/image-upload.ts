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

async function readImageUploadResponse(response: Response): Promise<ImageUploadResponse> {
	try {
		return (await response.json()) as ImageUploadResponse;
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
	return image;
}

export async function uploadImageAsset(file: File, purpose: ImageUploadPurpose) {
	return uploadImageFile(file, purpose, "Could not upload image.");
}

export async function uploadProfileImageAsset(file: File) {
	return uploadImageFile(file, undefined, "Could not upload profile picture.");
}
