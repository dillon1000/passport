import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noTypeof } from "../../lint/oxlint-plugin.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: {
			lang: "ts",
		},
	},
});

ruleTester.run("no-typeof", noTypeof, {
	valid: [
		"const value: unknown = null;",
		"type Value = string | number;",
		{
			code: 'const isString = typeof value === "string";',
			options: [{ allowComparisons: true }],
		},
		{
			code: 'const isString = "string" === typeof value;',
			options: [{ allowComparisons: true }],
		},
		{
			code: "type Factory = typeof createFactory;",
			options: [{ allowTypeQueries: true }],
		},
	],
	invalid: [
		{
			code: 'const isString = typeof value === "string";',
			errors: [{ messageId: "runtime" }],
		},
		{
			code: "const matchesExpectedType = typeof value === expectedType;",
			options: [{ allowComparisons: true }],
			errors: [{ messageId: "runtime" }],
		},
		{
			code: "type Factory = typeof createFactory;",
			errors: [{ messageId: "typeQuery" }],
		},
	],
});
