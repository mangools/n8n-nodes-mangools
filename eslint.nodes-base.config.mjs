/**
 * Runs eslint-plugin-n8n-nodes-base 2.x directly, in addition to `npm run lint`.
 *
 * `n8n-node lint` bundles its own (older) copy of this plugin alongside
 * @n8n/eslint-plugin-community-nodes. This config pins the standalone plugin so the node is
 * checked against both rule sets, including the community-package-json rules that only apply
 * when package.json is linted as source.
 */
import tsParser from '@typescript-eslint/parser';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

const { nodes, credentials, community } = n8nNodesBase.configs;

/**
 * These three rules encode nodes-base-internal conventions that the current official community
 * node scaffolding (`npm create @n8n/node`, template declarative/github-issues) deliberately
 * contradicts, and that @n8n/eslint-plugin-community-nodes does not raise:
 *
 * - inputs/outputs-wrong: the rules want the string literal 'main'; the template exports
 *   `NodeConnectionTypes.Main`, which is what n8n's own nodes use today.
 * - documentation-url-miscased: the rule wants a camelCase docs slug, which only resolves
 *   against n8n's own hosted docs; a community node has to give a full external URL, and the
 *   template's credential does exactly that.
 */
const SUPERSEDED_BY_COMMUNITY_TEMPLATE = {
	'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
	'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
	'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
};

export default [
	{
		files: ['nodes/**/*.ts'],
		languageOptions: { parser: tsParser, parserOptions: { extraFileExtensions: ['.json'] } },
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: { ...nodes.rules, ...SUPERSEDED_BY_COMMUNITY_TEMPLATE },
	},
	{
		files: ['credentials/**/*.ts'],
		languageOptions: { parser: tsParser },
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: { ...credentials.rules, ...SUPERSEDED_BY_COMMUNITY_TEMPLATE },
	},
	{
		files: ['package.json'],
		languageOptions: { parser: tsParser, parserOptions: { extraFileExtensions: ['.json'] } },
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: community.rules,
	},
];
