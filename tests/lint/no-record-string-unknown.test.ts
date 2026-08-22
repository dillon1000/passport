import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noRecordStringUnknown } from "../../lint/oxlint-plugin.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: {
			lang: "ts",
		},
	},
});

ruleTester.run("no-record-string-unknown", noRecordStringUnknown, {
	valid: [
		"type Value = Record<string, string>;",
		"type Value = Record<number, unknown>;",
		"type Value = { [key: string]: unknown };",
		"type Value = object;",
	],
	invalid: [
		{
			code: "type Value = Record<string, unknown>;",
			output: "type Value = { [key: string]: unknown };",
			errors: [{ messageId: "useIndexSignature" }],
		},
		{
			code: "type Values = Record<string, unknown>[];",
			output: "type Values = { [key: string]: unknown }[];",
			errors: [{ messageId: "useIndexSignature" }],
		},
	],
});
