/** Individual overall usage amounts from /api/usage-summary (values in cents). */
export interface IndividualOverallUsage {
	usedCents: number;
	limitCents: number;
	remainingCents: number;
	billingCycleStart: Date;
	billingCycleEnd: Date;
}

/** Single usage event from /api/dashboard/get-filtered-usage-events. */
export interface UsageEvent {
	timestamp: string;
	conversationId: string;
	chargedCents: number;
	model: string;
}

/** Label/count pair used by Conversation Insights histograms. */
export interface ConversationHistogramItem {
	label: string;
	count: number;
}

/** Response from /api/v2/analytics/team/conversation-classification. */
export interface ConversationClassification {
	intentDistribution: ConversationHistogramItem[];
	categoriesHistogram: ConversationHistogramItem[];
	complexityDistribution: ConversationHistogramItem[];
	guidanceLevelDistribution: ConversationHistogramItem[];
}

/** Response from /api/v2/analytics/team/conversation-segments. */
export interface ConversationSegments {
	workTypeHistogram: ConversationHistogramItem[];
	/**
	 * Categories shown on Cursor's Conversation Insights Categories chart.
	 * Distinct from classification.categoriesHistogram.
	 */
	categoriesHistogram: ConversationHistogramItem[];
}

/** Combined Conversation Insights payload for the selected timeframe. */
export interface ConversationInsightsPayload {
	classification: ConversationClassification;
	segments: ConversationSegments;
}
