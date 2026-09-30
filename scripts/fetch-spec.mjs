#!/usr/bin/env node
/**
 * Downloads the Mangools OpenAPI document to openapi/openapi.json, which is gitignored.
 * The spec is the only definition of the API; SPEC_URL overrides where it is fetched from.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(PKG, 'openapi', 'openapi.json');
const url = process.env.SPEC_URL || 'https://api.mangools.com/v3/openapi.json';

const fail = (message) => {
	console.error(`Cannot fetch the OpenAPI spec from ${url}: ${message}`);
	process.exit(1);
};

let response;
try {
	response = await fetch(url, { headers: { accept: 'application/json' } });
} catch (error) {
	fail(error.cause?.message ?? error.message);
}
if (!response.ok) fail(`HTTP ${response.status}`);

const bytes = Buffer.from(await response.arrayBuffer());
let spec;
try {
	spec = JSON.parse(bytes.toString('utf8'));
} catch (error) {
	fail(`the response is not valid JSON (${error.message})`);
}
if (!spec?.openapi || !spec.paths || Object.keys(spec.paths).length === 0) fail('the response is not an OpenAPI document');

// Same normalisation as the other Mangools API repositories, so the sha256 values agree.
const text = `${JSON.stringify(spec, null, 2)}\n`;
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, text);
console.log(`Fetched ${url}\n  ${Buffer.byteLength(text)} bytes, sha256 ${createHash('sha256').update(text).digest('hex')}`);
