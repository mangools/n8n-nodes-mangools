# n8n-nodes-mangools

This is an n8n community node. It lets you read SEO data from [Mangools](https://mangools.com/) —
KWFinder, SERPChecker, SERPWatcher, LinkMiner, SiteProfiler and AI Search Watcher — in your n8n
workflows.

[n8n](https://n8n.io/) is a fair-code licensed
workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Quotas](#quotas)
[Development](#development)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in
the n8n community nodes documentation, using the package name `n8n-nodes-mangools`.

## Operations

25 read operations across 8 resources.

- **Account**
  - Get Limits — remaining balance of every quota pool
- **KWFinder**
  - Get Related Keywords, Get Competitor Keywords, Get Suggested Keywords
  - Get Competitor Domains
  - Get URL Difficulty Metrics
- **SERPChecker**
  - Get SERP, Get URL Metrics
- **SERPWatcher**
  - Get Many Trackings, Get Tracking Detail, Get Many Tracked Keywords, Get Tracking Stats
- **AI Search Watcher**
  - Get Many Monitors, Get Monitor, Get Many Monitor Prompts, Get Prompt, Get Many Models
- **LinkMiner**
  - Get Many Backlinks, Get URL Metrics
- **SiteProfiler**
  - Get Overview, Get Many Competitors, Get Backlink Profile, Get Many Top Content
- **Location**
  - Search, Get — resolve the `location_id` the KWFinder and SERPChecker operations need

Write operations (creating trackings, editing keyword lists, deleting monitors) are deliberately
not exposed. This node is read-only.

## Credentials

The Mangools API authenticates with a single API key sent in the `x-access-token` header.

1. Sign in at [mangools.com](https://mangools.com/) or register a free account.
2. Open <https://mangools.com/api-token>.
3. Copy the API key.
4. In n8n, create a new **Mangools API** credential and paste the key into **API Key**.

Select **Test** to check the credential. The test calls `GET /kwfinder/lists`, which consumes no
quota and returns `401` on an invalid key.

## Compatibility

Built and linted against `n8n-workflow` 2.36.3 with `@n8n/node-cli` 0.45.3 on Node.js 22, and
loaded and executed in n8n 2.36.6 on Node.js 24.

The node uses `NodeConnectionTypes`, themed (light/dark) icons and `usableAsTool`. Those require a
reasonably recent n8n; if the node fails to load, upgrade n8n first.

To use the node as an AI agent tool on a self-hosted instance, start n8n with
`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Usage

The KWFinder and SERPChecker operations take a numeric **Location ID**, not a country name. Resolve
it with **Location → Search**:

1. **Location → Search** with **Query** `New York`. Each match arrives as its own item; read `_id`
   and check `label` to confirm it is the place you meant.
2. **KWFinder → Get Related Keywords** with **Keyword**, and **Options → Location ID** set to that
   `_id`. **Language ID** is optional and also numeric.

Operations that emit **one n8n item per record** — Related Keywords, Competitor Keywords, Suggested
Keywords, Get Many Backlinks, Get Many Monitors, Get Many Models, Location Search, Get Competitor
Domains, LinkMiner URL Metrics — need no Split Out node before a Filter or Sort. Every other
operation emits a single item holding the whole response.

One exception is worth knowing about: `GET /kwfinder/competitor-domain` returns a bare array of
strings, so **KWFinder → Get Competitor Domains** emits one item per domain whose `json` *is* the
domain string. Reference it as `{{ $json }}`, not `{{ $json.something }}`.

## Quotas

Mangools bills per request against named quota pools rather than a single request counter.
`GET /kwfinder/limits` (**Account → Get Limits**) reports the remaining balance of each pool.

Every operation's description in the node UI says whether it counts towards a paid quota pool.
The pool is the `x-quota-pool` value of that operation in the OpenAPI document at
`https://api.mangools.com/v3/openapi.json`.

## Development

The node's operations, parameters and routing are **generated from the Mangools OpenAPI document**,
which is downloaded at build time from `https://api.mangools.com/v3/openapi.json` and never stored
in git. Set `SPEC_URL` to fetch it from somewhere else. A build that cannot fetch the spec fails.

```shell
npm install
npm run fetch-spec      # download openapi/openapi.json
npm run generate        # write nodes/Mangools/GeneratedOperations.ts and docs/operations.md
npm run sync            # both of the above
npm run lint            # fetch, generate, then n8n-node lint
npm run lint:nodes-base # eslint-plugin-n8n-nodes-base, standalone
npm run build           # fetch, generate, then n8n-node build
npm run dev             # run a local n8n with this node loaded
```

Which operations are exposed, identified by `operationId`, and their n8n-facing names and descriptions live in
`scripts/operations.config.json`. Everything else — HTTP method, URL, parameters, types, required
flags, defaults, parameter descriptions, quota pools, base URL — comes from the spec. The generator fails if
the spec and the selected operations disagree.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Mangools API documentation](https://apidocs.mangools.com)
- [Using n8n with the hosted Mangools MCP server instead](https://apidocs.mangools.com/integrations/n8n/)

## License

[MIT](LICENSE)

This repository is maintained by the Mangools team and does not accept external pull requests or issues. Please send questions and bug reports to support@mangools.com.
