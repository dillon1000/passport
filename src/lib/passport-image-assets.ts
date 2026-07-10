/**
 * Reusable Passport image storage. Inputs are validated image files and an
 * assignment callback that atomically swaps the owning database field. Outputs
 * are absolute public URLs; storage rollback and replaced-object cleanup are
 * handled here so profile, organization, and team images share one workflow.
 */
import { DelegatedResourceError, delegatedBadRequest } from "./delegated-resource-errors";

export const PASSPORT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PASSPORT_IMAGE_PATH_PREFIX = "/api/profile-images/";
export const PASSPORT_IMAGE_KEY_PREFIX = "profile-images";

const IMAGE_EXTENSIONS = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
} as const;

export type PassportImagePurpose = "profile" | "organization-logo" | "team-logo";

type PassportImageStorage = {
	delete(key: string): Promise<void>;
	put(
		key: string,
		value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
		options?: R2PutOptions,
	): Promise<unknown>;
};

export type PassportImageAssetService = ReturnType<typeof createPassportImageAssetService>;

function absoluteImageURL(origin: string, value: string) {
	return new URL(value, origin).toString();
}

export function passportOwnedImageKey(origin: string, value: string | null | undefined) {
	if (!value) return null;
	try {
		const baseURL = new URL(origin);
		const imageURL = new URL(value, baseURL);
		if (imageURL.origin !== baseURL.origin) return null;
		if (!imageURL.pathname.startsWith(PASSPORT_IMAGE_PATH_PREFIX)) return null;
		const key = imageURL.pathname.slice(PASSPORT_IMAGE_PATH_PREFIX.length);
		return key.startsWith(`${PASSPORT_IMAGE_KEY_PREFIX}/`) ? key : null;
	} catch {
		return null;
	}
}

/**
 * Creates a storage workflow bound to Passport's public origin and R2 bucket.
 * `assign` must update the database and return the URL it replaced; throwing
 * rolls back the newly written object.
 */
export function createPassportImageAssetService(options: {
	origin: string;
	storage: PassportImageStorage;
	generateID?: () => string;
}) {
	const generateID = options.generateID ?? (() => crypto.randomUUID());

	async function deleteOwnedAsset(value: string | null | undefined) {
		const key = passportOwnedImageKey(options.origin, value);
		if (!key) return;
		await options.storage.delete(key).catch(() => undefined);
	}

	async function assignImage(input: {
		file: File;
		ownerID: string;
		purpose: PassportImagePurpose;
		assign: (absoluteURL: string) => Promise<string | null | undefined>;
	}) {
		const extension = IMAGE_EXTENSIONS[input.file.type as keyof typeof IMAGE_EXTENSIONS];
		if (!extension) {
			throw delegatedBadRequest(
				"invalid_image_type",
				"Image must be a PNG, JPEG, GIF, or WebP file.",
			);
		}
		if (input.file.size > PASSPORT_IMAGE_MAX_BYTES) {
			throw new DelegatedResourceError(
				413,
				"image_too_large",
				"Image must be 2 MiB or smaller.",
			);
		}

		const key = [
			PASSPORT_IMAGE_KEY_PREFIX,
			encodeURIComponent(input.ownerID),
			input.purpose,
			`${generateID()}.${extension}`,
		].join("/");
		await options.storage.put(key, input.file, {
			httpMetadata: { contentType: input.file.type },
		});

		const imageURL = absoluteImageURL(
			options.origin,
			`${PASSPORT_IMAGE_PATH_PREFIX}${key}`,
		);
		let replacedURL: string | null | undefined;
		try {
			replacedURL = await input.assign(imageURL);
		} catch (error) {
			await options.storage.delete(key).catch(() => undefined);
			throw error;
		}
		if (replacedURL !== imageURL) await deleteOwnedAsset(replacedURL);
		return imageURL;
	}

	async function clearImage(input: {
		assign: () => Promise<string | null | undefined>;
	}) {
		const replacedURL = await input.assign();
		await deleteOwnedAsset(replacedURL);
	}

	return {
		assignImage,
		clearImage,
		deleteOwnedAsset,
		toAbsoluteURL(value: string | null | undefined) {
			return value ? absoluteImageURL(options.origin, value) : null;
		},
	};
}
