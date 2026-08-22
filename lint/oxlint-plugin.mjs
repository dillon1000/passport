/**
 * Project-specific Oxlint rules. Each rule uses Oxlint's ESLint-compatible JS
 * plugin API and must remain dependency-free so linting can start reliably.
 */

const MESSAGE_ID = "useIndexSignature";
const TYPEOF_RESULTS = new Set([
	"undefined",
	"object",
	"boolean",
	"number",
	"bigint",
	"string",
	"symbol",
	"function",
]);

/** Matches the exact built-in-style syntax `Record<string, unknown>`. */
function isRecordStringUnknown(node) {
	if (node.typeName.type !== "Identifier" || node.typeName.name !== "Record") return false;

	const parameters = node.typeArguments?.params ?? node.typeParameters?.params;
	return parameters?.length === 2
		&& parameters[0].type === "TSStringKeyword"
		&& parameters[1].type === "TSUnknownKeyword";
}

export const noRecordStringUnknown = {
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow Record<string, unknown> in favor of explicit object shapes.",
		},
		fixable: "code",
		schema: [],
		messages: {
			[MESSAGE_ID]: "Use an index signature or a named object type instead of Record<string, unknown>.",
		},
	},
	create(context) {
		return {
			TSTypeReference(node) {
				if (!isRecordStringUnknown(node)) return;

				context.report({
					node,
					messageId: MESSAGE_ID,
					fix(fixer) {
						return fixer.replaceText(node, "{ [key: string]: unknown }");
					},
				});
			},
		};
	},
};

export const noTypeof = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow runtime and type-position uses of typeof.",
		},
		schema: [
			{
				type: "object",
				additionalProperties: false,
				properties: {
					allowComparisons: { type: "boolean" },
					allowTypeQueries: { type: "boolean" },
				},
			},
		],
		messages: {
			runtime: "Do not use the runtime typeof operator.",
			typeQuery: "Do not use typeof in a TypeScript type query.",
		},
	},
	create(context) {
		const options = context.options[0] ?? {};

		return {
			UnaryExpression(node) {
				if (node.operator !== "typeof") return;
				const parent = node.parent;
				const otherOperand = parent?.left === node ? parent.right : parent?.left;
				const isComparison = parent?.type === "BinaryExpression"
					&& ["==", "!=", "===", "!=="].includes(parent.operator)
					&& otherOperand?.type === "Literal"
					&& TYPEOF_RESULTS.has(otherOperand.value);
				if (options.allowComparisons && isComparison) return;

				context.report({ node, messageId: "runtime" });
			},
			TSTypeQuery(node) {
				if (options.allowTypeQueries) return;
				context.report({ node, messageId: "typeQuery" });
			},
		};
	},
};

export default {
	meta: {
		name: "passport",
	},
	rules: {
		"no-record-string-unknown": noRecordStringUnknown,
		"no-typeof": noTypeof,
	},
};
