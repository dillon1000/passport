/**
 * R2 multipart upload helpers for generated Worker streams. Inputs are
 * application-produced byte streams with no known final length; outputs are R2
 * objects written through concrete multipart chunks. Tune the part size only
 * when memory limits or archive size requirements change.
 */
export const R2_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
const R2_MAX_MULTIPART_PARTS = 10_000;

type MultipartUpload = {
	abort(): Promise<void>;
	complete(uploadedParts: R2UploadedPart[]): Promise<unknown>;
	uploadPart(partNumber: number, value: Uint8Array): Promise<R2UploadedPart>;
};

type MultipartBucket = {
	createMultipartUpload(
		key: string,
		options?: R2MultipartOptions,
	): Promise<MultipartUpload>;
};

type MultipartUploadInput = {
	bucket: MultipartBucket;
	key: string;
	options?: R2MultipartOptions;
	partSize?: number;
	stream: ReadableStream<Uint8Array>;
};

export async function uploadStreamWithR2Multipart({
	bucket,
	key,
	options,
	partSize = R2_MULTIPART_PART_SIZE_BYTES,
	stream,
}: MultipartUploadInput) {
	if (!Number.isInteger(partSize) || partSize < 1) {
		throw new TypeError("R2 multipart part size must be a positive integer.");
	}

	const upload = await bucket.createMultipartUpload(key, options);
	const reader = stream.getReader();
	const uploadedParts: R2UploadedPart[] = [];
	let partNumber = 1;
	let pending = new Uint8Array(partSize);
	let pendingLength = 0;

	async function uploadPart(bytes: Uint8Array) {
		if (partNumber > R2_MAX_MULTIPART_PARTS) {
			throw new Error("R2 multipart upload exceeded the maximum part count.");
		}
		uploadedParts.push(await upload.uploadPart(partNumber, bytes));
		partNumber += 1;
	}

	try {
		for (;;) {
			const read = await reader.read();
			if (read.done) break;

			let sourceOffset = 0;
			while (sourceOffset < read.value.byteLength) {
				const available = partSize - pendingLength;
				const take = Math.min(available, read.value.byteLength - sourceOffset);
				pending.set(read.value.subarray(sourceOffset, sourceOffset + take), pendingLength);
				pendingLength += take;
				sourceOffset += take;

				if (pendingLength === partSize) {
					await uploadPart(pending);
					pending = new Uint8Array(partSize);
					pendingLength = 0;
				}
			}
		}

		if (pendingLength > 0 || uploadedParts.length === 0) {
			await uploadPart(pending.slice(0, pendingLength));
		}

		return await upload.complete(uploadedParts);
	} catch (error) {
		await upload.abort().catch((abortError: unknown) => {
			console.warn("R2 multipart upload abort failed.", abortError);
		});
		throw error;
	} finally {
		reader.releaseLock();
	}
}
