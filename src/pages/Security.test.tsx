import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => {
	const DialogPart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	return {
		Dialog: DialogPart,
		DialogContent: DialogPart,
		DialogDescription: DialogPart,
		DialogFooter: DialogPart,
		DialogHeader: DialogPart,
		DialogTitle: DialogPart,
	};
});

import { SecurityConfirmationDialog } from "./Security";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoots = ["src", "example-client/src"].map((sourceRoot) =>
	path.join(projectRoot, sourceRoot),
);
const sourceExtensionPattern = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/;
const ignoredSourcePattern = /(?:^|\/)(?:worker-configuration\.d\.ts|.*\.test\.[cm]?[jt]sx?)$/;
const nativeDialogCallPattern = /\b(?:window\.|globalThis\.)?(?:alert|confirm|prompt)\s*\(/;

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const filePath = path.join(directory, entry);
		const stats = statSync(filePath);
		if (stats.isDirectory()) {
			return sourceFiles(filePath);
		}
		if (!sourceExtensionPattern.test(filePath) || ignoredSourcePattern.test(filePath)) {
			return [];
		}
		return [filePath];
	});
}

describe("native browser dialogs", () => {
	it("keeps production UI on the app dialog and alert primitives", () => {
		const offenders = sourceRoots.flatMap((sourceRoot) =>
			sourceFiles(sourceRoot).flatMap((filePath) => {
				const source = readFileSync(filePath, "utf8");
				return source
					.split("\n")
					.flatMap((line, index) =>
						nativeDialogCallPattern.test(line)
							? [`${path.relative(projectRoot, filePath)}:${index + 1}`]
							: [],
					);
			}),
		);

		expect(offenders).toEqual([]);
	});
});

describe("SecurityConfirmationDialog", () => {
	it("renders passkey removal as an in-app confirmation", () => {
		const html = renderToStaticMarkup(
			<SecurityConfirmationDialog
				action={{ type: "delete-passkey", passkeyId: "passkey_123" }}
				busy={false}
				onCancel={() => undefined}
				onConfirm={() => undefined}
			/>,
		);

		expect(html).toContain("Remove passkey?");
		expect(html).toContain("Remove passkey");
		expect(html).toContain("Cancel");
	});
});
