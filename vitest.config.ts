import path from "node:path";

import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(__dirname);
const testRoot = path.join(projectRoot, "tests");

/**
 * Tests keep the same directory shape as the production code under `tests/`.
 * Resolve their relative imports from the corresponding production directory,
 * so moving a test does not change the module it exercises.
 */
const testSourceModuleResolver = {
	name: "test-source-module-resolver",
	async resolveId(source: string, importer?: string) {
		if (!importer || !source.startsWith(".")) return null;

		const testPathPrefix = `${testRoot}${path.sep}`;
		if (!importer.startsWith(testPathPrefix)) return null;

		const sourceImporter = path.join(projectRoot, importer.slice(testPathPrefix.length));
		return this.resolve(source, sourceImporter, { skipSelf: true });
	},
};

export default defineConfig({
	plugins: [testSourceModuleResolver],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "node",
		globals: false,
		include: ["tests/**/*.test.{ts,tsx,mjs}"],
	},
});
