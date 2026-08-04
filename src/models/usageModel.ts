import type { IndividualOverallUsage } from '../api/types';

/**
 * View-ready usage model shared by StatusBar and Sidebar.
 * Future fields (today's spend, burn rate, model breakdown, etc.)
 * can be added here without changing view wiring.
 */
export interface UsageModel {
	usedCents: number;
	limitCents: number;
	remainingCents: number;
	billingCycleStart: Date;
	billingCycleEnd: Date;
	/** 0–100, based on used / limit. */
	percentUsed: number;
}

export function toUsageModel(usage: IndividualOverallUsage): UsageModel {
	const percentUsed =
		usage.limitCents > 0 ? (usage.usedCents / usage.limitCents) * 100 : 0;

	return {
		usedCents: usage.usedCents,
		limitCents: usage.limitCents,
		remainingCents: usage.remainingCents,
		billingCycleStart: usage.billingCycleStart,
		billingCycleEnd: usage.billingCycleEnd,
		percentUsed,
	};
}
