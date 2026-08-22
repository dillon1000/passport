import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Guards the app's loading-state contract. Page and auth-component UI should
 * expose skeleton placeholders for loading surfaces. The sign-in card uses its
 * deliberate full-card spinner; generic component motion such as dialogs and
 * menus lives outside these scanned directories.
 */
const uiRoots = ["src/pages", "src/components/auth"] as const;
const spinnerLoadingSurfaceFiles = new Set(["src/pages/SignIn.tsx"]);

const loadingAnimationPattern = /\banimate-(spin|pulse)\b/;
const visibleLoadingCopyPattern =
	/\b(?:Loading|Checking|Authorizing)\b.*(\.\.\.|\\u2026|\u2026)/;

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry);
		const stats = statSync(path);

		if (stats.isDirectory()) return collectSourceFiles(path);
		if (!/\.(tsx|ts)$/.test(entry) || /\.test\.(tsx|ts)$/.test(entry)) return [];

		return [path];
	});
}

function findNonSkeletonLoadingIndicators() {
	return uiRoots
		.flatMap((root) => collectSourceFiles(root))
		.flatMap((path) => {
			const file = readFileSync(path, "utf8");
			const relativePath = relative(process.cwd(), path);
			return file.split("\n").flatMap((line, index) => {
				const disallowedAnimation =
					loadingAnimationPattern.test(line) && !spinnerLoadingSurfaceFiles.has(relativePath);
				if (!disallowedAnimation && !visibleLoadingCopyPattern.test(line)) {
					return [];
				}

				return `${relativePath}:${index + 1}: ${line.trim()}`;
			});
		});
}

describe("loading states", () => {
	it("uses skeletons except for the sign-in card spinner and avoids visible loading copy", () => {
		expect(findNonSkeletonLoadingIndicators()).toEqual([]);
	});
});
