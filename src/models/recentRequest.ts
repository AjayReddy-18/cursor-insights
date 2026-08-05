import { formatCentsAsUsd, formatLocalTime } from '../api/format';
import type { UsageEvent } from '../api/types';

/** View-ready recent request row for the sidebar. */
export interface RecentRequest {
	time: string;
	model: string;
	cost: string;
}

export function toRecentRequest(event: UsageEvent): RecentRequest {
	return {
		time: formatLocalTime(event.timestamp),
		model: event.model,
		cost: formatCentsAsUsd(event.chargedCents),
	};
}

export function toRecentRequests(events: UsageEvent[]): RecentRequest[] {
	return events.map(toRecentRequest);
}
