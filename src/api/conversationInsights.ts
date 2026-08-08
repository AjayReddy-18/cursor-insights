import type { AuthProvider } from '../auth/types';
import { log, logError } from '../logger';
import type {
	ConversationClassification,
	ConversationHistogramItem,
	ConversationInsightsPayload,
	ConversationSegments,
} from './types';

const CLASSIFICATION_URL =
	'https://cursor.com/api/v2/analytics/team/conversation-classification';
const SEGMENTS_URL =
	'https://cursor.com/api/v2/analytics/team/conversation-segments';

export type ConversationInsightsDateRange = {
	startDate: string;
	endDate: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function requireFiniteNumber(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return undefined;
	}
	return value;
}

/**
 * Builds the authenticated GET URL for a Conversation Insights endpoint.
 * Only startDate and endDate are included — never email, teamId, or c.
 */
export function buildConversationInsightsUrl(
	baseUrl: string,
	range: ConversationInsightsDateRange
): string {
	const url = new URL(baseUrl);
	url.searchParams.set('startDate', range.startDate);
	url.searchParams.set('endDate', range.endDate);
	return url.toString();
}

async function fetchJson(
	auth: AuthProvider,
	url: string
): Promise<unknown> {
	log(`API request started: GET ${url}`);

	const authHeaders = await auth.getAuthHeaders();
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			...authHeaders,
		},
	});

	log(`Response status: ${response.status} ${response.statusText}`);

	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}`);
	}

	return response.json();
}

/**
 * Fetches both Conversation Insights analytics endpoints for the date range.
 */
export async function fetchConversationInsights(
	auth: AuthProvider,
	range: ConversationInsightsDateRange
): Promise<ConversationInsightsPayload> {
	const classificationUrl = buildConversationInsightsUrl(
		CLASSIFICATION_URL,
		range
	);
	const segmentsUrl = buildConversationInsightsUrl(SEGMENTS_URL, range);

	try {
		const [classificationRaw, segmentsRaw] = await Promise.all([
			fetchJson(auth, classificationUrl),
			fetchJson(auth, segmentsUrl),
		]);

		return {
			classification: parseConversationClassification(classificationRaw),
			segments: parseConversationSegments(segmentsRaw),
		};
	} catch (error) {
		logError('Conversation Insights API request failed:', error);
		throw error;
	}
}

export function parseConversationClassification(
	data: unknown
): ConversationClassification {
	const record = isRecord(data) ? data : {};

	return {
		intentDistribution: parseHistogram(
			record.intent_distribution,
			['intent']
		),
		categoriesHistogram: parseHistogram(
			record.categories_histogram,
			['category']
		),
		complexityDistribution: parseHistogram(
			record.complexity_distribution,
			['complexity']
		),
		guidanceLevelDistribution: parseHistogram(
			record.guidance_level_distribution,
			['guidance_level', 'guidanceLevel']
		),
	};
}

export function parseConversationSegments(data: unknown): ConversationSegments {
	const record = isRecord(data) ? data : {};

	return {
		workTypeHistogram: parseHistogram(record.work_type_histogram, [
			'work_type',
			'workType',
		]),
		categoriesHistogram: parseHistogram(record.categories_histogram, [
			'category',
		]),
	};
}

/**
 * Parses a histogram array defensively. Malformed entries are skipped.
 */
export function parseHistogram(
	value: unknown,
	labelKeys: string[]
): ConversationHistogramItem[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const items: ConversationHistogramItem[] = [];

	for (const entry of value) {
		if (!isRecord(entry)) {
			continue;
		}

		const count = requireFiniteNumber(entry.count);
		if (count === undefined || count < 0) {
			continue;
		}

		const label = readLabel(entry, labelKeys);
		if (!label) {
			continue;
		}

		items.push({ label, count });
	}

	return items;
}

function readLabel(
	entry: Record<string, unknown>,
	labelKeys: string[]
): string | undefined {
	for (const key of labelKeys) {
		const value = entry[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	// Fall back to the first non-count string field.
	for (const [key, value] of Object.entries(entry)) {
		if (key === 'count') {
			continue;
		}
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	return undefined;
}
