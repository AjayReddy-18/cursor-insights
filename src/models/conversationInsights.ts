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
 * Formats a YYYY-MM-DD date string from a local Date (calendar day).
 */
export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
	const next = startOfLocalDay(date);
	next.setDate(next.getDate() + days);
	return next;
}

/**
 * Computes startDate/endDate for Conversation Insights using the user's local calendar.
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
	const today = startOfLocalDay(now);
	const endDate = formatLocalDate(today);

	switch (timeframe) {
		case '1D':
			return { startDate: endDate, endDate };
		case '7D':
			return {
				startDate: formatLocalDate(addLocalDays(today, -7)),
				endDate,
			};
		case '30D':
			return {
				startDate: formatLocalDate(addLocalDays(today, -30)),
				endDate,
			};
		case 'MTD': {
			const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
			return {
				startDate: formatLocalDate(monthStart),
				endDate,
			};
		}
	}
}

/** Formats API labels cleanly for display (e.g. ktlo → Ktlo). */
export function formatInsightLabel(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return 'Unknown';
	}

	if (/[A-Z]/.test(trimmed) || /\s/.test(trimmed)) {
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
 * Prompt Specificity uses guidance_level_distribution under the hood.
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
			return payload.classification.categoriesHistogram;
		case 'taskComplexity':
			return payload.classification.complexityDistribution;
		case 'promptSpecificity':
			return payload.classification.guidanceLevelDistribution;
	}
}

export function getChartSegmentsForMetric(
	payload: ConversationInsightsPayload,
	metric: ConversationMetric
): ConversationChartSegment[] {
	return toChartSegments(getHistogramForMetric(payload, metric));
}
