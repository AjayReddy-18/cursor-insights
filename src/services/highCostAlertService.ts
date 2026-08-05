import * as vscode from 'vscode';
import { fetchIndividualUsage } from '../api/client';
import { formatCentsAsUsd } from '../api/format';
import {
	fetchCurrentTeamId,
	fetchLatestUsageEvent,
	usageEventId,
} from '../api/usageEvents';
import type { UsageEvent } from '../api/types';
import type { AuthProvider } from '../auth/types';
import { getAlertThreshold } from '../config';
import { log, logError } from '../logger';

const POLL_INTERVAL_MS = 60_000;
const IGNORE_BUTTON = 'Ignore this conversation';
const OK_BUTTON = 'OK';

/**
 * Independently polls for the latest Cursor usage event and alerts when
 * a new request exceeds the configured cost threshold.
 */
export class HighCostAlertService implements vscode.Disposable {
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private pollInFlight: Promise<void> | undefined;
	private lastProcessedId: string | undefined;
	private initialized = false;
	private teamId: number | undefined;
	private billingCycleStart: Date | undefined;
	private billingCycleEnd: Date | undefined;
	private readonly ignoredConversations = new Set<string>();

	constructor(private readonly auth: AuthProvider) {}

	async initialize(): Promise<void> {
		if (!(await this.auth.isAuthenticated())) {
			return;
		}

		await this.poll({ bootstrap: true });
		this.startPolling();
	}

	/** Call after a successful account connect. */
	async onConnected(): Promise<void> {
		this.resetSessionState();
		await this.poll({ bootstrap: true });
		this.startPolling();
	}

	/** Call after account disconnect. */
	onDisconnected(): void {
		this.stopPolling();
		this.resetSessionState();
	}

	dispose(): void {
		this.stopPolling();
		this.ignoredConversations.clear();
	}

	private resetSessionState(): void {
		this.lastProcessedId = undefined;
		this.initialized = false;
		this.teamId = undefined;
		this.billingCycleStart = undefined;
		this.billingCycleEnd = undefined;
		this.ignoredConversations.clear();
	}

	private startPolling(): void {
		this.stopPolling();
		log('High-cost alert polling started');
		this.pollTimer = setInterval(() => {
			void this.poll({ bootstrap: false });
		}, POLL_INTERVAL_MS);
	}

	private stopPolling(): void {
		if (this.pollTimer !== undefined) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
	}

	private async poll(options: { bootstrap: boolean }): Promise<void> {
		if (this.pollInFlight) {
			return this.pollInFlight;
		}

		this.pollInFlight = this.doPoll(options).finally(() => {
			this.pollInFlight = undefined;
		});

		return this.pollInFlight;
	}

	private async doPoll(options: { bootstrap: boolean }): Promise<void> {
		if (!(await this.auth.isAuthenticated())) {
			return;
		}

		log('High-cost alert polling tick started');

		try {
			await this.ensureContext();
			if (
				this.teamId === undefined ||
				!this.billingCycleStart ||
				!this.billingCycleEnd
			) {
				return;
			}

			const event = await fetchLatestUsageEvent(this.auth, {
				teamId: this.teamId,
				billingCycleStart: this.billingCycleStart,
				billingCycleEnd: this.billingCycleEnd,
			});

			log('High-cost alert polling completed');

			if (!event) {
				log('Latest usage event received: none');
				if (options.bootstrap) {
					this.initialized = true;
				}
				return;
			}

			const eventId = usageEventId(event);
			log(
				`Latest usage event received: id=${eventId} model=${event.model} chargedCents=${event.chargedCents}`
			);

			if (options.bootstrap || !this.initialized) {
				this.lastProcessedId = eventId;
				this.initialized = true;
				log(`Initialized last processed event: ${eventId}`);
				return;
			}

			if (eventId === this.lastProcessedId) {
				return;
			}

			log(`New usage event detected: ${eventId}`);
			this.lastProcessedId = eventId;
			await this.processNewEvent(event);
		} catch (error) {
			logError('High-cost alert polling failed:', error);
		}
	}

	private async ensureContext(): Promise<void> {
		if (this.teamId === undefined) {
			this.teamId = await fetchCurrentTeamId(this.auth);
			log(`Resolved teamId: ${this.teamId}`);
		}

		const cycleExpired =
			this.billingCycleEnd !== undefined &&
			Date.now() > this.billingCycleEnd.getTime();

		if (!this.billingCycleStart || !this.billingCycleEnd || cycleExpired) {
			const usage = await fetchIndividualUsage(this.auth);
			this.billingCycleStart = usage.billingCycleStart;
			this.billingCycleEnd = usage.billingCycleEnd;
			log(
				`Resolved billing cycle: ${this.billingCycleStart.toISOString()} → ${this.billingCycleEnd.toISOString()}`
			);
		}
	}

	private async processNewEvent(event: UsageEvent): Promise<void> {
		if (
			event.conversationId &&
			this.ignoredConversations.has(event.conversationId)
		) {
			log(`Skipping ignored conversation: ${event.conversationId}`);
			return;
		}

		const threshold = getAlertThreshold();
		const costUsd = event.chargedCents / 100;

		if (costUsd <= threshold) {
			return;
		}

		log(
			`Threshold exceeded: cost=$${costUsd.toFixed(2)} threshold=$${threshold.toFixed(2)}`
		);
		await this.showAlert(event, threshold);
	}

	private async showAlert(event: UsageEvent, threshold: number): Promise<void> {
		const cost = formatCentsAsUsd(event.chargedCents);
		const thresholdLabel = formatCentsAsUsd(Math.round(threshold * 100));
		const model = formatModelName(event.model);

		const message = [
			'Your last Cursor request cost ' + cost + '.',
			'',
			'Threshold: ' + thresholdLabel,
			'',
			'Model: ' + model,
		].join('\n');

		log(`Alert shown: cost=${cost} model=${model}`);

		const choice = await vscode.window.showInformationMessage(
			message,
			OK_BUTTON,
			IGNORE_BUTTON
		);

		if (choice === IGNORE_BUTTON) {
			if (event.conversationId) {
				this.ignoredConversations.add(event.conversationId);
				log(`Conversation ignored: ${event.conversationId}`);
			} else {
				log('Ignore requested but event has no conversationId');
			}
		}
	}
}

/** Turns API model slugs into a short display label. */
function formatModelName(model: string): string {
	return model
		.split(/[-_]/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
