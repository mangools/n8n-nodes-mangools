import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

import { MANGOOLS_BASE_URL } from '../nodes/Mangools/GeneratedOperations';

export class MangoolsApi implements ICredentialType {
	name = 'mangoolsApi';

	displayName = 'Mangools API';

	documentationUrl = 'https://github.com/mangools/n8n-nodes-mangools?tab=readme-ov-file#credentials';

	icon: Icon = {
		light: 'file:../icons/mangools.svg',
		dark: 'file:../icons/mangools.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Mangools API key. Copy it at https://mangools.com/api-token. Sent as the x-access-token header.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-access-token': '={{$credentials.apiKey}}',
			},
		},
	};

	/**
	 * GET /kwfinder/lists, not the free-tagged GET /kwfinder/limits: limits answers 200 with an
	 * anonymous payload when the token is missing or invalid, so it cannot tell a good key from a
	 * bad one. lists is equally quota-free but returns 401 on a bad key.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: MANGOOLS_BASE_URL,
			url: '/kwfinder/lists',
			method: 'GET',
		},
	};
}
