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
