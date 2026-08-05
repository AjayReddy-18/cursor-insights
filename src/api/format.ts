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

/**
 * Formats an API usage-event timestamp in the user's local 24-hour time.
 * Examples: "14:14", "09:08"
 */
export function formatLocalTime(timestamp: string): string {
	const ms = Number(timestamp);
	const date =
		Number.isFinite(ms) && timestamp.trim() !== ''
			? new Date(ms)
			: new Date(timestamp);

	if (Number.isNaN(date.getTime())) {
		return timestamp;
	}

	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}
