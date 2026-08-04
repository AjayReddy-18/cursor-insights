import type { AuthProvider } from '../auth/types';
import { log, logError } from '../logger';
import type { UsageEvent } from './types';

const TEAMS_URL = 'https://cursor.com/api/dashboard/teams';
const FILTERED_USAGE_EVENTS_URL =
	'https://cursor.com/api/dashboard/get-filtered-usage-events';

/** Personal / non-team accounts use teamId 0 on the dashboard API. */
const PERSONAL_TEAM_ID = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function requireNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw new Error(`Invalid response: ${path} must be a number`);
	}
	return value;
}

/**
 * Resolves the current team id for filtered usage-event requests.
 * Uses the first team when present; otherwise falls back to 0 (personal).
 */
export async function fetchCurrentTeamId(auth: AuthProvider): Promise<number> {
	log(`API request started: POST ${TEAMS_URL}`);

	try {
		const authHeaders = await auth.getAuthHeaders();
		const response = await fetch(TEAMS_URL, {
			method: 'POST',
			headers: {
				...authHeaders,
				'Content-Type': 'application/json',
				Origin: 'https://cursor.com',
			},
			body: JSON.stringify({}),
		});

		log(`Response status: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`);
		}

		const data: unknown = await response.json();
		return parseTeamId(data);
	} catch (error) {
		logError('Failed to fetch team id:', error);
		throw error;
	}
}

export function parseTeamId(data: unknown): number {
	if (!isRecord(data)) {
		throw new Error('Invalid teams response: expected an object');
	}

	const teams = data.teams;
	if (!Array.isArray(teams) || teams.length === 0) {
		return PERSONAL_TEAM_ID;
	}

	const first = teams[0];
	if (!isRecord(first)) {
		throw new Error('Invalid teams response: teams[0] must be an object');
	}

	return requireNumber(first.id, 'teams[0].id');
}

/**
 * Fetches only the latest usage event for the current billing cycle.
 */
export async function fetchLatestUsageEvent(
	auth: AuthProvider,
	params: {
		teamId: number;
		billingCycleStart: Date;
		billingCycleEnd: Date;
	}
): Promise<UsageEvent | undefined> {
	log(`API request started: POST ${FILTERED_USAGE_EVENTS_URL}`);

	try {
		const authHeaders = await auth.getAuthHeaders();
		const response = await fetch(FILTERED_USAGE_EVENTS_URL, {
			method: 'POST',
			headers: {
				...authHeaders,
				'Content-Type': 'application/json',
				Origin: 'https://cursor.com',
			},
			body: JSON.stringify({
				teamId: params.teamId,
				startDate: params.billingCycleStart.getTime(),
				endDate: params.billingCycleEnd.getTime(),
				page: 1,
				pageSize: 1,
			}),
		});

		log(`Response status: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`);
		}

		const data: unknown = await response.json();
		return parseLatestUsageEvent(data);
	} catch (error) {
		logError('Failed to fetch latest usage event:', error);
		throw error;
	}
}

export function parseLatestUsageEvent(data: unknown): UsageEvent | undefined {
	if (!isRecord(data)) {
		throw new Error('Invalid filtered-usage-events response: expected an object');
	}

	const events = data.usageEventsDisplay;
	if (!Array.isArray(events) || events.length === 0) {
		return undefined;
	}

	const raw = events[0];
	if (!isRecord(raw)) {
		throw new Error('Invalid filtered-usage-events response: events[0] must be an object');
	}

	const timestamp =
		typeof raw.timestamp === 'string' || typeof raw.timestamp === 'number'
			? String(raw.timestamp)
			: '';
	if (!timestamp) {
		throw new Error('Invalid filtered-usage-events response: missing timestamp');
	}

	const conversationId =
		typeof raw.conversationId === 'string' ? raw.conversationId : '';

	const chargedCents = requireNumber(raw.chargedCents, 'chargedCents');
	const model = typeof raw.model === 'string' ? raw.model : 'Unknown';

	return {
		timestamp,
		conversationId,
		chargedCents,
		model,
	};
}

/** Event identity used to detect new requests across polls. */
export function usageEventId(event: UsageEvent): string {
	return `${event.timestamp}_${event.conversationId}_${event.chargedCents}`;
}
