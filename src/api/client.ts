import { log, logError, logJson } from '../logger';

const USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary';

function headersToObject(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

export async function testApiConnection(): Promise<unknown> {
	log(`API request started: GET ${USAGE_SUMMARY_URL}`);

	try {
		const response = await fetch(USAGE_SUMMARY_URL, {
			credentials: 'include',
		});

		log(`Response status: ${response.status} ${response.statusText}`);
		logJson('Response headers:', headersToObject(response.headers));

		if (!response.ok) {
			throw new Error(String(response.status));
		}

		const data: unknown = await response.json();
		logJson('Success JSON:', data);
		return data;
	} catch (error) {
		logError('API request failed:', error);
		throw error;
	}
}
