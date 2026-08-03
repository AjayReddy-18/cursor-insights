import type { AuthProvider } from '../auth/types';
import { log, logError } from '../logger';
import type { IndividualOverallUsage } from './types';

const USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function requireNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw new Error(`Invalid usage-summary response: ${path} must be a number`);
	}
	return value;
}

function requireDate(value: unknown, path: string): Date {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid usage-summary response: ${path} must be a date string`);
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid usage-summary response: ${path} is not a valid date`);
	}
	return date;
}

/**
 * Fetches usage-summary and extracts only individualUsage.overall (+ billing cycle dates).
 * teamUsage and other usage fields are ignored.
 */
export async function fetchIndividualUsage(
	auth: AuthProvider
): Promise<IndividualOverallUsage> {
	log(`API request started: GET ${USAGE_SUMMARY_URL}`);

	try {
		const authHeaders = await auth.getAuthHeaders();

		const response = await fetch(USAGE_SUMMARY_URL, {
			method: 'GET',
			headers: {
				...authHeaders,
			},
		});

		log(`Response status: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`);
		}

		const data: unknown = await response.json();
		return parseIndividualUsage(data);
	} catch (error) {
		logError('API request failed:', error);
		throw error;
	}
}

export function parseIndividualUsage(data: unknown): IndividualOverallUsage {
	if (!isRecord(data)) {
		throw new Error('Invalid usage-summary response: expected an object');
	}

	const individualUsage = data.individualUsage;
	if (!isRecord(individualUsage)) {
		throw new Error('Invalid usage-summary response: missing individualUsage');
	}

	const overall = individualUsage.overall;
	if (!isRecord(overall)) {
		throw new Error('Invalid usage-summary response: missing individualUsage.overall');
	}

	return {
		usedCents: requireNumber(overall.used, 'individualUsage.overall.used'),
		limitCents: requireNumber(overall.limit, 'individualUsage.overall.limit'),
		remainingCents: requireNumber(overall.remaining, 'individualUsage.overall.remaining'),
		billingCycleStart: requireDate(data.billingCycleStart, 'billingCycleStart'),
		billingCycleEnd: requireDate(data.billingCycleEnd, 'billingCycleEnd'),
	};
}
