import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { MANGOOLS_BASE_URL, mangoolsOperations } from './GeneratedOperations';

export class Mangools implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mangools',
		name: 'mangools',
		icon: { light: 'file:../../icons/mangools.svg', dark: 'file:../../icons/mangools.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read SEO data from KWFinder, SERPChecker, SERPWatcher, LinkMiner, SiteProfiler and AI Search Watcher',
		defaults: {
			name: 'Mangools',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'mangoolsApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: MANGOOLS_BASE_URL,
			headers: {
				Accept: 'application/json',
			},
		},
		properties: mangoolsOperations,
	};
}
