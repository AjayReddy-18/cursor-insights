/**
 * Formats API cents values as USD with exactly 2 decimal places.
 * Examples: 1501 → "$15.01", 20000 → "$200.00"
 */
export function formatCentsAsUsd(cents: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(cents / 100);
}

/** Formats a billing-cycle endpoint as "Aug 1". */
export function formatBillingDay(date: Date): string {
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	});
}
