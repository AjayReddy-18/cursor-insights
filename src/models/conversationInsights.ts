import type {
	ConversationHistogramItem,
	ConversationInsightsPayload,
} from '../api/types';

export const CONVERSATION_TIMEFRAMES = ['1D', '7D', '30D', 'MTD'] as const;
export type ConversationTimeframe = (typeof CONVERSATION_TIMEFRAMES)[number];

export const CONVERSATION_METRICS = [
	'workType',
	'intentDistribution',
	'categories',
	'taskComplexity',
	'promptSpecificity',
] as const;
export type ConversationMetric = (typeof CONVERSATION_METRICS)[number];

export const CONVERSATION_METRIC_LABELS: Record<ConversationMetric, string> = {
	workType: 'Work Type',
	intentDistribution: 'Intent Distribution',
	categories: 'Categories',
	taskComplexity: 'Task Complexity',
	promptSpecificity: 'Prompt Specificity',
};

/** View-ready chart segment for the Conversation Insights doughnut. */
export interface ConversationChartSegment {
	label: string;
	count: number;
	percent: number;
}

export type ConversationInsightsDateRange = {
	startDate: string;
	endDate: string;
};

/**
 * Formats a YYYY-MM-DD date string from a UTC Date (calendar day).
 */
export function formatUtcDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** @deprecated Use formatUtcDate. */
export const formatLocalDate = formatUtcDate;

function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate()
	));
}

function addUtcDays(date: Date, days: number): Date {
	const next = startOfUtcDay(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

/**
 * Computes startDate/endDate for Conversation Insights using the UTC calendar.
 *
 * - 1D: today → today
 * - 7D: today − 7 days → today
 * - 30D: today − 30 days → today
 * - MTD: first day of current month → today
 */
export function getDateRangeForTimeframe(
	timeframe: ConversationTimeframe,
	now: Date = new Date()
): ConversationInsightsDateRange {
	const today = startOfUtcDay(now);
	const endDate = formatUtcDate(today);

	switch (timeframe) {
		case '1D':
			return { startDate: endDate, endDate };
		case '7D':
			return {
				startDate: formatUtcDate(addUtcDays(today, -7)),
				endDate,
			};
		case '30D':
			return {
				startDate: formatUtcDate(addUtcDays(today, -30)),
				endDate,
			};
		case 'MTD': {
			const monthStart = new Date(Date.UTC(
				today.getUTCFullYear(),
				today.getUTCMonth(),
				1
			));
			return {
				startDate: formatUtcDate(monthStart),
				endDate,
			};
		}
	}
}

/**
 * Preserves Cursor canonical labels.
 *
 * Human-readable API labels (e.g. "Bug Fixing & Debugging", "Code Explanation")
 * are returned unchanged. Snake_case / all-lowercase enum tokens (e.g. work_type
 * "new_feature", "ktlo") are title-cased the same way Cursor's Work Type chart
 * shows "New Feature" / "Ktlo".
 */
export function formatInsightLabel(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return 'Unknown';
	}

	// Already a Cursor-facing phrase — never rename.
	if (/[A-Z]/.test(trimmed) || /\s/.test(trimmed) || /[&/]/.test(trimmed)) {
		return trimmed;
	}

	return trimmed
		.split(/[_-]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(' ');
}

/**
 * Converts histogram items into chart segments with percentages.
 * Zero-total or empty histograms yield an empty array.
 * Label order is preserved from the API (Cursor typically ranks by count).
 */
export function toChartSegments(
	items: ConversationHistogramItem[]
): ConversationChartSegment[] {
	const total = items.reduce((sum, item) => sum + item.count, 0);
	if (total <= 0) {
		return [];
	}

	return items
		.filter((item) => item.count > 0)
		.map((item) => ({
			label: formatInsightLabel(item.label),
			count: item.count,
			percent: (item.count / total) * 100,
		}));
}

/**
 * Maps the selected UI metric to the corresponding API response field.
 *
 * Categories uses conversation-segments categories_histogram — the same series
 * Cursor's Conversation Insights Categories chart uses (verified against live
 * percentage distributions). Prompt Specificity maps from guidance_level_*.
 */
export function getHistogramForMetric(
	payload: ConversationInsightsPayload,
	metric: ConversationMetric
): ConversationHistogramItem[] {
	switch (metric) {
		case 'workType':
			return payload.segments.workTypeHistogram;
		case 'intentDistribution':
			return payload.classification.intentDistribution;
		case 'categories':
			return payload.segments.categoriesHistogram;
		case 'taskComplexity':
			return payload.classification.complexityDistribution;
		case 'promptSpecificity':
			// Uses conversation-segments.guidance_level_distribution —
			// NOT conversation-classification.guidance_level_distribution.
			return payload.segments.guidanceLevelDistribution;
	}
}

export function getChartSegmentsForMetric(
	payload: ConversationInsightsPayload,
	metric: ConversationMetric
): ConversationChartSegment[] {
	return toChartSegments(getHistogramForMetric(payload, metric));
}
