/**
 * Project-specific Oxlint rules. Each rule uses Oxlint's ESLint-compatible JS
 * plugin API and must remain dependency-free so linting can start reliably.
 */

const MESSAGE_ID = "useIndexSignature";

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

export default {
	meta: {
		name: "passport",
	},
	rules: {
		"no-record-string-unknown": noRecordStringUnknown,
	},
};
