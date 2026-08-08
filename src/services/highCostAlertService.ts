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
import { UsageMonitorCoordinator } from './usageMonitorCoordination';

const POLL_INTERVAL_MS = 60_000;
const COORDINATION_INTERVAL_MS = 5_000;
const IGNORE_BUTTON = 'Ignore this conversation';
const OK_BUTTON = 'OK';

export type HighCostAlertServiceOptions = {
	/** Directory shared across all Cursor windows (typically globalStorageUri). */
	storageDir: string;
	instanceId?: string;
	isWindowFocused?: () => boolean;
	now?: () => number;
	pollIntervalMs?: number;
	coordinationIntervalMs?: number;
	leaseTtlMs?: number;
	/** Injected for tests — defaults to the real API helpers. */
	fetchLatestUsageEvent?: typeof fetchLatestUsageEvent;
	fetchCurrentTeamId?: typeof fetchCurrentTeamId;
	fetchIndividualUsage?: typeof fetchIndividualUsage;
	getAlertThreshold?: typeof getAlertThreshold;
	showInformationMessage?: (
		message: string,
		...items: string[]
	) => Thenable<string | undefined>;
};

/**
 * Account-level high-cost usage monitor.
 *
 * Across multiple Cursor windows, a single elected leader polls usage.
 * Threshold-crossing alerts are recorded once in shared state and shown only
 * in the currently focused Cursor window.
 */
export class HighCostAlertService implements vscode.Disposable {
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private coordinationTimer: ReturnType<typeof setInterval> | undefined;
	private pollInFlight: Promise<void> | undefined;
	private tickQueue: Promise<void> = Promise.resolve();
	private initialized = false;
	private teamId: number | undefined;
	private billingCycleStart: Date | undefined;
	private billingCycleEnd: Date | undefined;
	private readonly coordinator: UsageMonitorCoordinator;
	private readonly isWindowFocused: () => boolean;
	private readonly pollIntervalMs: number;
	private readonly coordinationIntervalMs: number;
	private readonly fetchLatestUsageEvent: typeof fetchLatestUsageEvent;
	private readonly fetchCurrentTeamId: typeof fetchCurrentTeamId;
	private readonly fetchIndividualUsage: typeof fetchIndividualUsage;
	private readonly getAlertThreshold: typeof getAlertThreshold;
	private readonly showInformationMessage: (
		message: string,
		...items: string[]
	) => Thenable<string | undefined>;
	private readonly focusDisposable: vscode.Disposable;
	private showingAlert = false;

	constructor(
		private readonly auth: AuthProvider,
		options: HighCostAlertServiceOptions
	) {
		this.coordinator = new UsageMonitorCoordinator(options.storageDir, {
			instanceId: options.instanceId,
			now: options.now,
			leaseTtlMs: options.leaseTtlMs,
		});
		this.isWindowFocused =
			options.isWindowFocused ?? (() => vscode.window.state.focused);
		this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
		this.coordinationIntervalMs =
			options.coordinationIntervalMs ?? COORDINATION_INTERVAL_MS;
		this.fetchLatestUsageEvent =
			options.fetchLatestUsageEvent ?? fetchLatestUsageEvent;
		this.fetchCurrentTeamId = options.fetchCurrentTeamId ?? fetchCurrentTeamId;
		this.fetchIndividualUsage =
			options.fetchIndividualUsage ?? fetchIndividualUsage;
		this.getAlertThreshold = options.getAlertThreshold ?? getAlertThreshold;
		this.showInformationMessage =
			options.showInformationMessage ??
			((message, ...items) =>
				vscode.window.showInformationMessage(message, ...items));

		this.focusDisposable = vscode.window.onDidChangeWindowState(() => {
			if (this.isWindowFocused()) {
				void this.tryShowPendingAlert();
			}
		});
	}

	/** Exposed for tests. */
	getInstanceId(): string {
		return this.coordinator.instanceId;
	}

	/** Exposed for tests. */
	isLeader(): boolean {
		return this.coordinator.isLeader();
	}

	async initialize(): Promise<void> {
		if (!(await this.auth.isAuthenticated())) {
			return;
		}

		// Already running after a prior successful init / refresh.
		if (this.coordinationTimer !== undefined) {
			return;
		}

		await this.tick({ bootstrap: true });
		this.startTimers();
	}

	dispose(): void {
		this.stopTimers();
		this.focusDisposable.dispose();
		void this.coordinator.releaseLeadership();
	}

	private startTimers(): void {
		this.stopTimers();
		log('High-cost alert monitoring started');

		this.pollTimer = setInterval(() => {
			void this.tick({ bootstrap: false, usagePoll: true });
		}, this.pollIntervalMs);

		this.coordinationTimer = setInterval(() => {
			void this.tick({ bootstrap: false, usagePoll: false });
		}, this.coordinationIntervalMs);
	}

	private stopTimers(): void {
		if (this.pollTimer !== undefined) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
		if (this.coordinationTimer !== undefined) {
			clearInterval(this.coordinationTimer);
			this.coordinationTimer = undefined;
		}
	}

	/**
	 * Coordination tick: renew/elect leader, optionally poll usage, show pending alerts.
	 * Public for tests so multi-window scenarios can be driven without waiting on timers.
	 */
	async tick(options: {
		bootstrap: boolean;
		usagePoll?: boolean;
	}): Promise<void> {
		const run = this.tickQueue.then(() => this.doTick(options));
		// Keep the queue alive even if a tick fails.
		this.tickQueue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	private async doTick(options: {
		bootstrap: boolean;
		usagePoll?: boolean;
	}): Promise<void> {
		if (!(await this.auth.isAuthenticated())) {
			return;
		}

		const isLeader = await this.coordinator.tryBecomeLeader();
		const shouldPollUsage = options.usagePoll !== false;

		if (isLeader && shouldPollUsage) {
			await this.pollUsage({ bootstrap: options.bootstrap });
		}

		await this.tryShowPendingAlert();
	}

	private async pollUsage(options: { bootstrap: boolean }): Promise<void> {
		if (this.pollInFlight) {
			return this.pollInFlight;
		}

		this.pollInFlight = this.doPollUsage(options).finally(() => {
			this.pollInFlight = undefined;
		});

		return this.pollInFlight;
	}

	private async doPollUsage(options: { bootstrap: boolean }): Promise<void> {
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

			const event = await this.fetchLatestUsageEvent(this.auth, {
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

			const threshold = this.getAlertThreshold();
			const bootstrap = options.bootstrap || !this.initialized;
			const result = await this.coordinator.advanceToEvent(event, {
				threshold,
				bootstrap,
			});
			this.initialized = true;

			switch (result) {
				case 'bootstrapped':
					log(`Initialized last processed event: ${eventId}`);
					break;
				case 'unchanged':
					break;
				case 'skipped_ignored':
					log(`Skipping ignored conversation: ${event.conversationId}`);
					break;
				case 'skipped_below_threshold':
					log(`New usage event detected: ${eventId}`);
					break;
				case 'alert_enqueued':
					log(`New usage event detected: ${eventId}`);
					log(
						`Threshold exceeded: cost=$${(event.chargedCents / 100).toFixed(2)} threshold=$${threshold.toFixed(2)}`
					);
					break;
				case 'alert_duplicate':
					log(`Duplicate alert suppressed for event: ${eventId}`);
					break;
			}
		} catch (error) {
			logError('High-cost alert polling failed:', error);
		}
	}

	private async ensureContext(): Promise<void> {
		if (this.teamId === undefined) {
			this.teamId = await this.fetchCurrentTeamId(this.auth);
			log(`Resolved teamId: ${this.teamId}`);
		}

		const cycleExpired =
			this.billingCycleEnd !== undefined &&
			Date.now() > this.billingCycleEnd.getTime();

		if (!this.billingCycleStart || !this.billingCycleEnd || cycleExpired) {
			const usage = await this.fetchIndividualUsage(this.auth);
			this.billingCycleStart = usage.billingCycleStart;
			this.billingCycleEnd = usage.billingCycleEnd;
			log(
				`Resolved billing cycle: ${this.billingCycleStart.toISOString()} → ${this.billingCycleEnd.toISOString()}`
			);
		}
	}

	private async tryShowPendingAlert(): Promise<void> {
		if (this.showingAlert || !this.isWindowFocused()) {
			return;
		}

		const pending = await this.coordinator.claimPendingAlert();
		if (!pending) {
			return;
		}

		this.showingAlert = true;
		try {
			await this.showAlert(pending.event, pending.threshold);
			await this.coordinator.markAlertHandled(pending.eventId);
		} finally {
			this.showingAlert = false;
		}
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

		const choice = await this.showInformationMessage(
			message,
			OK_BUTTON,
			IGNORE_BUTTON
		);

		if (choice === IGNORE_BUTTON) {
			if (event.conversationId) {
				await this.coordinator.ignoreConversation(event.conversationId);
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
