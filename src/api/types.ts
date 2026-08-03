/** Individual overall usage amounts from /api/usage-summary (values in cents). */
export interface IndividualOverallUsage {
	usedCents: number;
	limitCents: number;
	remainingCents: number;
	billingCycleStart: Date;
	billingCycleEnd: Date;
}
