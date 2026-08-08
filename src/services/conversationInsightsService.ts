import * as vscode from 'vscode';
import { fetchConversationInsights } from '../api/conversationInsights';
import type { ConversationInsightsPayload } from '../api/types';
import type { AuthProvider } from '../auth/types';
import { getConversationTimeframe } from '../config';
import { log, logError } from '../logger';
import {
	getChartSegmentsForMetric,
	getDateRangeForTimeframe,
	type ConversationChartSegment,
	type ConversationMetric,
	type ConversationTimeframe,
} from '../models/conversationInsights';

export type ConversationInsightsChangeListener = (
	segments: ConversationChartSegment[],
	state: ConversationInsightsServiceState
) => void;

export type ConversationInsightsServiceState =
	| 'disconnected'
	| 'loading'
	| 'ready'
	| 'error';

/**
 * Fetches Conversation Insights analytics for the selected timeframe.
 * Metric changes re-map already-fetched data — no extra API calls.
 */
export class ConversationInsightsService implements vscode.Disposable {
	private payload: ConversationInsightsPayload | undefined;
	private segments: ConversationChartSegment[] = [];
	private state: ConversationInsightsServiceState = 'disconnected';
	private refreshInFlight: Promise<ConversationChartSegment[]> | undefined;
	private inFlightTimeframe: ConversationTimeframe | undefined;
	private queuedTimeframe: ConversationTimeframe | undefined;
	private metric: ConversationMetric = 'categories';
	private readonly listeners = new Set<ConversationInsightsChangeListener>();

	constructor(private readonly auth: AuthProvider) {}

	getSegments(): ConversationChartSegment[] {
		return this.segments;
	}

	getState(): ConversationInsightsServiceState {
		return this.state;
	}

	getMetric(): ConversationMetric {
		return this.metric;
	}

	onDidChange(listener: ConversationInsightsChangeListener): vscode.Disposable {
		this.listeners.add(listener);
		return new vscode.Disposable(() => {
			this.listeners.delete(listener);
		});
	}

	/**
	 * Updates the selected metric from cached payload data (no network).
	 */
	setMetric(metric: ConversationMetric): void {
		this.metric = metric;
		if (!this.payload) {
			this.setState(this.segments, this.state);
			return;
		}

		const next = getChartSegmentsForMetric(this.payload, metric);
		const nextState =
			this.state === 'error' || this.state === 'disconnected'
				? this.state
				: 'ready';
		this.setState(next, nextState);
	}

	async refresh(
		timeframe: ConversationTimeframe = getConversationTimeframe()
	): Promise<ConversationChartSegment[]> {
		if (this.refreshInFlight) {
			if (timeframe === this.inFlightTimeframe) {
				return this.refreshInFlight;
			}

			// Newest timeframe wins once the current request finishes.
			this.queuedTimeframe = timeframe;
			await this.refreshInFlight;
			if (this.queuedTimeframe === undefined) {
				return this.segments;
			}

			const next = this.queuedTimeframe;
			this.queuedTimeframe = undefined;
			return this.refresh(next);
		}

		this.inFlightTimeframe = timeframe;
		this.refreshInFlight = this.doRefresh(timeframe).finally(() => {
			this.refreshInFlight = undefined;
			this.inFlightTimeframe = undefined;
		});

		return this.refreshInFlight;
	}

	private async doRefresh(
		timeframe: ConversationTimeframe
	): Promise<ConversationChartSegment[]> {
		log(`Conversation Insights refresh started (timeframe=${timeframe})`);

		if (!(await this.auth.isAuthenticated())) {
			this.payload = undefined;
			this.setState([], 'disconnected');
			return [];
		}

		this.setState(this.segments, 'loading');

		try {
			const range = getDateRangeForTimeframe(timeframe);
			log(
				`Conversation Insights date range: ${range.startDate} → ${range.endDate}`
			);

			const payload = await fetchConversationInsights(this.auth, range);
			this.payload = payload;
			const model = getChartSegmentsForMetric(payload, this.metric);
			this.setState(model, 'ready');
			log(`Conversation Insights updated: ${model.length} segment(s)`);
			return model;
		} catch (error) {
			logError('Conversation Insights refresh failed:', error);

			if (this.payload) {
				const cached = getChartSegmentsForMetric(this.payload, this.metric);
				this.setState(cached, 'error');
				return cached;
			}

			this.setState([], 'error');
			return [];
		}
	}

	private setState(
		segments: ConversationChartSegment[],
		state: ConversationInsightsServiceState
	): void {
		this.segments = segments;
		this.state = state;
		for (const listener of this.listeners) {
			listener(segments, state);
		}
	}

	dispose(): void {
		this.listeners.clear();
	}
}
