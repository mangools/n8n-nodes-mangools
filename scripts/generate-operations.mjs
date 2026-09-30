#!/usr/bin/env node
/**
 * Generates nodes/Mangools/GeneratedOperations.ts and docs/operations.md from
 * openapi/openapi.json, which scripts/fetch-spec.mjs downloads.
 *
 * The OpenAPI document is the only source of HTTP methods, URLs, parameters, parameter
 * types, required flags, defaults, parameter descriptions, quota pools and the server URL.
 * scripts/operations.config.json contributes only the selection of operations, by
 * operationId, and their n8n-facing display copy, which the spec cannot supply in n8n's
 * required casing.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SPEC_PATH = join(PKG, 'openapi', 'openapi.json');
const CONFIG_PATH = join(HERE, 'operations.config.json');
const OUT_PATH = join(PKG, 'nodes', 'Mangools', 'GeneratedOperations.ts');
const DOCS_PATH = join(PKG, 'docs', 'operations.md');

/**
 * n8n display names must be Title Case and read as product language. Spec parameter names
 * are snake_case identifiers, so a mechanical transform produces "Kw" and "Is With Deleted".
 * Only names that transform badly are listed; everything else is derived.
 */
const DISPLAY_NAME_OVERRIDES = {
	kw: 'Keyword',
	url: 'URL',
	location_id: 'Location ID',
	language_id: 'Language ID',
	platform_id: 'Platform ID',
	tracking_id: 'Tracking ID',
	serp_id: 'SERP ID',
	list_id: 'List ID',
	link_id: 'Link ID',
	kwIds: 'Keyword IDs',
	is_with_deleted: 'Include Deleted',
	location: 'Location ID',
};

/** The spec carries no x-enum-varnames, so numeric enums have no derivable labels. */
const ENUM_LABELS = {
	'get-serpchecker-serps.platform_id': { 1: 'Desktop', 2: 'Mobile' },
};

if (!existsSync(SPEC_PATH)) {
	console.error(`${SPEC_PATH} does not exist, run \`npm run fetch-spec\` first`);
	process.exit(1);
}

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const specHash = createHash('sha256').update(readFileSync(SPEC_PATH)).digest('hex');

const fail = (message) => {
	console.error(message);
	process.exit(1);
};

const baseUrl = spec.servers?.[0]?.url;
if (!baseUrl) fail('spec has no servers[0].url');

const camel = (name) => name.replace(/[_-](\w)/g, (_, c) => c.toUpperCase());

const titleCase = (name) =>
	name
		.split(/[_\s-]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

const displayNameFor = (param, path) => {
	if (param.in === 'path' && param.name === 'id') {
		const segment = path.split('/').filter(Boolean).at(path.split('/').filter(Boolean).indexOf('{id}') - 1);
		return `${titleCase(segment ?? 'Record')} ID`;
	}
	return DISPLAY_NAME_OVERRIDES[param.name] ?? titleCase(param.name);
};

/**
 * Applies the description rules eslint-plugin-n8n-nodes-base enforces, so generated output is
 * lint-clean without an autofix pass: `id`/`url` are miscased, a one-sentence description must
 * not end in a period, and a two-sentence one must.
 */
const describe = (text) => {
	let flat = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (!flat) return undefined;
	flat = flat.charAt(0).toUpperCase() + flat.slice(1);
	flat = flat
		.replace(/\burls\b/gi, 'URLs')
		.replace(/\burl\b/gi, 'URL')
		.replace(/\bids\b/gi, 'IDs')
		.replace(/\bid\b/gi, 'ID');
	const sentences = flat.replace('e.g.', '').split('. ').length;
	if (sentences === 1 && flat.endsWith('.')) flat = flat.slice(0, -1);
	if (sentences === 2 && !flat.endsWith('.')) flat += '.';
	return flat;
};

const warnings = [];

const squash = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A description that only repeats the parameter name or its label tells a user nothing. */
const describeParam = (param, displayName, label, commaSeparated) => {
	if (!param.description || squash(param.description) === squash(param.name)) {
		warnings.push(`${label}: parameter '${param.name}' has no usable description in the spec`);
		return undefined;
	}
	const text = describe(commaSeparated ? `${param.description} (comma-separated)` : param.description);
	return squash(text) === squash(displayName) ? undefined : text;
};

const n8nType = (schema) => {
	if (schema?.enum) return 'options';
	switch (schema?.type) {
		case 'integer':
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'array':
			return 'string';
		default:
			return 'string';
	}
};

const defaultFor = (schema, type) => {
	if (schema?.default !== undefined) return schema.default;
	if (type === 'options') return schema.enum[0];
	if (type === 'number') return 0;
	if (type === 'boolean') return false;
	return '';
};

const ind = (level) => '\t'.repeat(level);

/** Emits a TS object literal with tab indentation matching the n8n code style. */
const literal = (value, level = 0) => {
	if (value === undefined) return undefined;
	if (value === null) return 'null';
	if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		const items = value.map((v) => `${ind(level + 1)}${literal(v, level + 1)},`).join('\n');
		return `[\n${items}\n${ind(level)}]`;
	}
	const entries = Object.entries(value).filter(([, v]) => v !== undefined);
	if (entries.length === 0) return '{}';
	const body = entries
		.map(([k, v]) => `${ind(level + 1)}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${literal(v, level + 1)},`)
		.join('\n');
	return `{\n${body}\n${ind(level)}}`;
};

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const operationsById = new Map();
for (const [path, item] of Object.entries(spec.paths ?? {})) {
	for (const method of HTTP_METHODS) {
		const op = item[method];
		if (op?.operationId) operationsById.set(op.operationId, { op, path, method });
	}
}

const resolveOperation = (operationId) => {
	const found = operationsById.get(operationId);
	if (!found) fail(`spec has no operation with operationId '${operationId}'`);
	return found;
};

/** Turns /a/{b}/c into an n8n URL expression, and reports which path params it consumed. */
const routingUrl = (path) => {
	const consumed = [];
	const url = path.replace(/\{(\w+)\}/g, (_, name) => {
		consumed.push(name);
		return `{{$parameter["${camel(name)}"]}}`;
	});
	return { url: consumed.length ? `=${url}` : url, consumed };
};

const deref = (node, seen = new Set()) => {
	if (!node?.$ref) return node;
	if (seen.has(node.$ref)) fail(`circular $ref ${node.$ref}`);
	seen.add(node.$ref);
	const target = node.$ref
		.replace(/^#\//, '')
		.split('/')
		.reduce((acc, key) => acc?.[key], spec);
	if (!target) fail(`unresolvable $ref ${node.$ref}`);
	return deref(target, seen);
};

const successSchema = (op) => {
	const ok = op.responses?.['200'] ?? op.responses?.['201'];
	return deref(ok?.content?.['application/json']?.schema);
};

/**
 * Several endpoints wrap their payload in a single-key envelope. n8n workflows want one item
 * per record, so the envelope key is unwrapped -- but only after the spec confirms it exists.
 */
const rootPropertyRouting = (op, declared, label) => {
	if (!declared) return undefined;
	const prop = deref(successSchema(op)?.properties?.[declared]);
	if (!prop) fail(`${label}: config declares rootProperty '${declared}' but the spec response has no such property`);
	if (prop.type !== 'array') fail(`${label}: rootProperty '${declared}' is '${prop.type}' in the spec, not an array`);
	return {
		output: {
			postReceive: [{ type: 'rootProperty', properties: { property: declared } }],
		},
	};
};

/**
 * A "Get Many" operation should yield one n8n item per record. Where the spec types the
 * response as a bare object with no unwrappable array, the spec and the endpoint disagree --
 * report it rather than silently shipping a node that returns one item for a list.
 */
const checkListShape = (op, operation, label) => {
	if (!operation.value.startsWith('getMany') || operation.rootProperty) return;
	const schema = successSchema(op);
	if (schema?.type === 'array') return;
	warnings.push(`${label}: list operation but the spec types the 200 response as '${schema?.type ?? 'unknown'}' with no array to unwrap`);
};

const properties = [];
const catalogue = [];
const stats = { operations: 0, params: 0, optionalParams: 0, bodyParams: 0, quotaOps: 0 };

const resourceOptions = config.resources
	.map((r) => ({ name: r.name, value: r.value, description: describe(r.description) }))
	.sort((a, b) => a.name.localeCompare(b.name));

properties.push({
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: resourceOptions,
	default: 'kwfinder',
});

for (const resource of config.resources) {
	const showResource = { resource: [resource.value] };
	const operationOptions = [];

	for (const operation of resource.operations) {
		const label = `${resource.value}.${operation.value}`;
		const { op, path, method } = resolveOperation(operation.operationId);
		const { url, consumed } = routingUrl(path);
		stats.operations += 1;

		const quotaPool = op['x-quota-pool'];
		const isPaid = (op.tags ?? []).includes('paid');
		if (quotaPool) stats.quotaOps += 1;

		/**
		 * The pool identifier itself is kept out of the UI copy: it contains bare words like
		 * `url` that n8n's description linter rewrites to `URL`, which would corrupt the id.
		 * docs/operations.md carries the exact identifiers instead.
		 */
		const quotaNote = isPaid
			? 'Counts towards a paid quota pool'
			: 'Does not count towards a paid quota pool';

		operationOptions.push({
			name: operation.name,
			value: operation.value,
			action: operation.action,
			description: describe(`${operation.description}. ${quotaNote}`),
			routing: {
				request: { method: method.toUpperCase(), url },
				...rootPropertyRouting(op, operation.rootProperty, label),
			},
		});

		catalogue.push({
			resource: resource.name,
			operation: operation.name,
			method: method.toUpperCase(),
			path,
			paid: isPaid,
			quotaPool,
			rootProperty: operation.rootProperty,
			topLevelArray: successSchema(op)?.type === 'array',
		});

		checkListShape(op, operation, label);

		const showOperation = { ...showResource, operation: [operation.value] };
		const specParams = (op.parameters ?? []).map((p) => ({ ...deref(p), schema: deref(deref(p).schema) }));
		const pathParams = specParams.filter((p) => p.in === 'path');
		const missing = consumed.filter((name) => !pathParams.some((p) => p.name === name));
		if (missing.length) fail(`${label}: path template references ${missing.join(', ')} but the spec declares no such path parameter`);

		const optional = [];

		/**
		 * Query arrays travel as a comma-separated string, which is what the API expects.
		 * A body array has to arrive as a real JSON array, so it becomes a multi-value
		 * field instead of one comma-separated box.
		 */
		const fieldFor = (param, { asJsonArray }) => {
			const isArray = param.schema?.type === 'array';
			const multi = isArray && asJsonArray;
			const type = multi ? n8nType(param.schema.items) : n8nType(param.schema);
			const enumLabels = ENUM_LABELS[`${operation.operationId}.${param.name}`];
			const displayName = displayNameFor(param, path);
			const field = {
				displayName,
				name: camel(param.name),
				type,
				typeOptions: multi ? { multipleValues: true } : undefined,
				default: multi ? [] : defaultFor(param.schema, type),
				description: describeParam(param, displayName, label, isArray && !asJsonArray),
			};

			if (type === 'options') {
				field.options = param.schema.enum
					.map((value) => ({ name: enumLabels?.[value] ?? String(value), value }))
					.sort((a, b) => String(a.name).localeCompare(String(b.name)));
			}
			if (param.schema?.example !== undefined && type === 'string' && !multi) {
				field.placeholder = `e.g. ${param.schema.example}`;
			}
			return field;
		};

		for (const param of specParams) {
			if (param.in !== 'path' && param.in !== 'query') fail(`${label}: unsupported parameter location '${param.in}'`);
			stats.params += 1;

			const base = fieldFor(param, { asJsonArray: false });

			if (param.in === 'path') {
				properties.push({ ...base, required: true, displayOptions: { show: showOperation } });
				continue;
			}
			if (param.required) {
				properties.push({
					...base,
					required: true,
					displayOptions: { show: showOperation },
					routing: { send: { type: 'query', property: param.name } },
				});
				continue;
			}
			stats.optionalParams += 1;
			optional.push({ ...base, routing: { request: { qs: { [param.name]: '={{$value}}' } } } });
		}

		/**
		 * Without this the generator would silently drop a parameter that the spec declares
		 * in the request body rather than in the query string.
		 */
		if (op.requestBody) {
			const media = Object.keys(op.requestBody.content ?? {});
			if (media.length !== 1 || media[0] !== 'application/json') {
				fail(`${label}: request body media type ${media.join(', ') || '(none)'} is not supported`);
			}
			const bodySchema = deref(op.requestBody.content['application/json'].schema);
			if (bodySchema?.type !== 'object' || !bodySchema.properties) {
				fail(`${label}: request body is not an object with properties, so it cannot become node fields`);
			}
			const requiredNames = bodySchema.required ?? [];

			for (const [name, raw] of Object.entries(bodySchema.properties)) {
				stats.params += 1;
				stats.bodyParams += 1;
				const schema = deref(raw);
				const base = fieldFor({ name, schema, description: schema.description }, { asJsonArray: true });

				if (op.requestBody.required && requiredNames.includes(name)) {
					properties.push({
						...base,
						required: true,
						displayOptions: { show: showOperation },
						routing: { send: { type: 'body', property: name } },
					});
					continue;
				}
				stats.optionalParams += 1;
				optional.push({ ...base, routing: { request: { body: { [name]: '={{$value}}' } } } });
			}
		}

		if (optional.length) {
			properties.push({
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: showOperation },
				options: optional.sort((a, b) => a.displayName.localeCompare(b.displayName)),
			});
		}
	}

	properties.push({
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showResource },
		options: [...operationOptions].sort((a, b) => a.name.localeCompare(b.name)),
		default: resource.operations[0].value,
	});
}

/** Resource, then Operation, then that operation's inputs -- the order n8n renders panels in. */
const ordered = [
	properties[0],
	...config.resources.flatMap((resource) => {
		const operationProp = properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.[0] === resource.value,
		);
		const inputs = properties.filter(
			(p) => p.name !== 'operation' && p.displayOptions?.show?.resource?.[0] === resource.value,
		);
		return [operationProp, ...inputs];
	}),
];

const banner = `/**
 * GENERATED FILE -- DO NOT EDIT.
 *
 * Regenerate with \`npm run sync\`.
 *
 * Source spec: openapi/openapi.json (${spec.info.title} ${spec.info.version}, OpenAPI ${spec.openapi})
 * Spec sha256: ${specHash}
 * Selection:   scripts/operations.config.json
 * Coverage:    ${stats.operations} operations across ${config.resources.length} resources, ${stats.params} parameters
 */`;

const source = `${banner}

import type { INodeProperties } from 'n8n-workflow';

export const MANGOOLS_BASE_URL = '${baseUrl}';

export const mangoolsOperations: INodeProperties[] = ${literal(ordered, 0)};
`;

const itemsNote = (entry) => {
	if (entry.rootProperty) return `one per \`${entry.rootProperty}[]\` entry`;
	if (entry.topLevelArray) return 'one per array element';
	return 'whole response';
};

const rows = catalogue
	.map(
		(entry) =>
			`| ${entry.resource} | ${entry.operation} | \`${entry.method} ${entry.path}\` | ${
				entry.paid ? 'Paid' : 'Free'
			} | ${entry.quotaPool ? `\`${entry.quotaPool}\`` : '—'} | ${itemsNote(entry)} |`,
	)
	.join('\n');

const docs = `<!-- GENERATED FILE -- DO NOT EDIT. Regenerate with \`npm run sync\`. -->

# Operations

${stats.operations} operations selected from ${Object.keys(spec.paths).length} paths in
${spec.info.title} ${spec.info.version}, generated from \`openapi/openapi.json\`
(sha256 \`${specHash}\`).

**Selection rule:** ${config.selectionRule}

"Quota pool" is the \`x-quota-pool\` value from the spec. \`GET /kwfinder/limits\`
(**Account → Get Limits**) reports the remaining balance of each pool under \`resources\`.
"Items" is what one n8n execution emits. n8n splits a top-level JSON array into one item per
element on its own; where the payload sits inside an envelope key, the node unwraps that key.
Everything else arrives as a single item holding the whole response.

| Resource | Operation | Endpoint | Billing | Quota pool | Items |
| --- | --- | --- | --- | --- | --- |
${rows}
`;

for (const warning of warnings) console.warn(`warning: ${warning}`);

const outputs = [
	[OUT_PATH, source],
	[DOCS_PATH, docs],
];

for (const [path, content] of outputs) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}
console.log(
	`Wrote ${outputs.map(([path]) => path.replace(`${PKG}/`, '')).join(', ')}\n  ${stats.operations} operations, ` +
		`${config.resources.length} resources, ${stats.params} parameters (${stats.optionalParams} optional, ` +
		`${stats.bodyParams} in the request body), ${stats.quotaOps} with a quota pool\n  spec sha256 ${specHash}`,
);
