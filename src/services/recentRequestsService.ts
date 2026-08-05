import * as vscode from 'vscode';
import { fetchIndividualUsage } from '../api/client';
import {
	fetchCurrentTeamId,
	fetchFilteredUsageEvents,
} from '../api/usageEvents';
import type { AuthProvider } from '../auth/types';
import { log, logError } from '../logger';
import {
	toRecentRequests,
	type RecentRequest,
} from '../models/recentRequest';

const PAGE_SIZE = 5;

export type RecentRequestsChangeListener = (
	requests: RecentRequest[],
	state: RecentRequestsServiceState
) => void;

export type RecentRequestsServiceState =
	| 'disconnected'
	| 'loading'
	| 'ready'
	| 'error';

/**
 * Fetches the latest usage events for the Recent Requests sidebar section.
 * Does not poll — callers refresh on sidebar open and the refresh button.
 */
export class RecentRequestsService implements vscode.Disposable {
	private requests: RecentRequest[] = [];
	private state: RecentRequestsServiceState = 'disconnected';
	private refreshInFlight: Promise<RecentRequest[]> | undefined;
	private teamId: number | undefined;
	private billingCycleStart: Date | undefined;
	private billingCycleEnd: Date | undefined;
	private readonly listeners = new Set<RecentRequestsChangeListener>();

	constructor(private readonly auth: AuthProvider) {}

	getRequests(): RecentRequest[] {
		return this.requests;
	}

	getState(): RecentRequestsServiceState {
		return this.state;
	}

	onDidChange(listener: RecentRequestsChangeListener): vscode.Disposable {
		this.listeners.add(listener);
		return new vscode.Disposable(() => {
			this.listeners.delete(listener);
		});
	}

	/** Call after a successful account connect. */
	async onConnected(): Promise<void> {
		this.resetSessionState();
		await this.refresh();
	}

	/** Call after account disconnect. */
	onDisconnected(): void {
		this.resetSessionState();
		this.setState([], 'disconnected');
	}

	async refresh(): Promise<RecentRequest[]> {
		if (this.refreshInFlight) {
			return this.refreshInFlight;
		}

		this.refreshInFlight = this.doRefresh().finally(() => {
			this.refreshInFlight = undefined;
		});

		return this.refreshInFlight;
	}

	private async doRefresh(): Promise<RecentRequest[]> {
		log('Recent requests refresh started');

		if (!(await this.auth.isAuthenticated())) {
			this.resetSessionState();
			this.setState([], 'disconnected');
			return [];
		}

		this.setState(this.requests, 'loading');

		try {
			await this.ensureContext();
			if (
				this.teamId === undefined ||
				!this.billingCycleStart ||
				!this.billingCycleEnd
			) {
				this.setState([], 'error');
				return [];
			}

			const events = await fetchFilteredUsageEvents(this.auth, {
				teamId: this.teamId,
				billingCycleStart: this.billingCycleStart,
				billingCycleEnd: this.billingCycleEnd,
				page: 1,
				pageSize: PAGE_SIZE,
			});

			const model = toRecentRequests(events);
			this.setState(model, 'ready');
			log(`Recent requests updated: ${model.length} event(s)`);
			return model;
		} catch (error) {
			logError('Recent requests refresh failed:', error);

			if (this.requests.length > 0) {
				this.setState(this.requests, 'error');
				return this.requests;
			}

			this.setState([], 'error');
			return [];
		}
	}

	private async ensureContext(): Promise<void> {
		if (this.teamId === undefined) {
			this.teamId = await fetchCurrentTeamId(this.auth);
			log(`Recent requests resolved teamId: ${this.teamId}`);
		}

		const cycleExpired =
			this.billingCycleEnd !== undefined &&
			Date.now() > this.billingCycleEnd.getTime();

		if (!this.billingCycleStart || !this.billingCycleEnd || cycleExpired) {
			const usage = await fetchIndividualUsage(this.auth);
			this.billingCycleStart = usage.billingCycleStart;
			this.billingCycleEnd = usage.billingCycleEnd;
			log(
				`Recent requests resolved billing cycle: ${this.billingCycleStart.toISOString()} → ${this.billingCycleEnd.toISOString()}`
			);
		}
	}

	private resetSessionState(): void {
		this.teamId = undefined;
		this.billingCycleStart = undefined;
		this.billingCycleEnd = undefined;
	}

	private setState(
		requests: RecentRequest[],
		state: RecentRequestsServiceState
	): void {
		this.requests = requests;
		this.state = state;
		for (const listener of this.listeners) {
			listener(requests, state);
		}
	}

	dispose(): void {
		this.listeners.clear();
	}
}
