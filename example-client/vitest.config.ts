import path from "node:path";

import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(__dirname);
const testRoot = path.resolve(projectRoot, "../tests/example-client");

/**
 * Example-client tests mirror their production paths below the root test
 * directory, while this resolver retains their original relative imports.
 */
const testSourceModuleResolver = {
	name: "example-client-test-source-module-resolver",
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
	test: {
		environment: "node",
		globals: false,
		include: ["../tests/example-client/worker/**/*.test.ts"],
	},
});
