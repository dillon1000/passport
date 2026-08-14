import { describe, expect, it, vi } from "vitest";

import { uploadStreamWithR2Multipart } from "./r2-multipart";

function byteStream(chunks: number[]) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const size of chunks) {
				controller.enqueue(new Uint8Array(size).fill(size));
			}
			controller.close();
		},
	});
}

function createMultipartMocks() {
	const uploadPart = vi.fn(async (partNumber: number, value: Uint8Array) => ({
		partNumber,
		etag: `etag-${partNumber}-${value.byteLength}`,
	}));
	const abort = vi.fn(async () => undefined);
	const complete = vi.fn(async (parts: R2UploadedPart[]) => ({ key: "archive.zip", parts }));
	const createMultipartUpload = vi.fn(async () => ({
		key: "archive.zip",
		uploadId: "upload_123",
		uploadPart,
		abort,
		complete,
	}));

	return {
		bucket: { createMultipartUpload },
		uploadPart,
		abort,
		complete,
		createMultipartUpload,
	};
}

describe("uploadStreamWithR2Multipart", () => {
	it("uploads generated streams as concrete parts", async () => {
		const multipart = createMultipartMocks();

		await uploadStreamWithR2Multipart({
			bucket: multipart.bucket,
			key: "archive.zip",
			partSize: 5,
			stream: byteStream([2, 4, 5]),
		});

		expect(multipart.uploadPart).toHaveBeenCalledTimes(3);
		expect(multipart.uploadPart.mock.calls.map((call) => [call[0], call[1].byteLength])).toEqual([
			[1, 5],
			[2, 5],
			[3, 1],
		]);
		expect(multipart.complete).toHaveBeenCalledWith([
			{ partNumber: 1, etag: "etag-1-5" },
			{ partNumber: 2, etag: "etag-2-5" },
			{ partNumber: 3, etag: "etag-3-1" },
		]);
		expect(multipart.abort).not.toHaveBeenCalled();
	});

	it("aborts the multipart upload when reading or uploading fails", async () => {
		const multipart = createMultipartMocks();
		multipart.uploadPart.mockRejectedValueOnce(new Error("upload failed"));

		await expect(
			uploadStreamWithR2Multipart({
				bucket: multipart.bucket,
				key: "archive.zip",
				partSize: 5,
				stream: byteStream([6]),
			}),
		).rejects.toThrow("upload failed");

		expect(multipart.abort).toHaveBeenCalledOnce();
		expect(multipart.complete).not.toHaveBeenCalled();
	});
});
