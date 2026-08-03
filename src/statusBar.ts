import * as vscode from 'vscode';
import { fetchIndividualUsage } from './api/client';
import { formatBillingDay, formatCentsAsUsd } from './api/format';
import type { IndividualOverallUsage } from './api/types';
import type { AuthProvider } from './auth/types';
import { log, logError } from './logger';

export const CONNECT_COMMAND = 'cursor-stats.connect';
export const DISCONNECT_COMMAND = 'cursor-stats.disconnect';
export const REFRESH_COMMAND = 'cursor-stats.refresh';

const DISCONNECTED_TEXT = '⚠ Connect Cursor';
const REFRESHING_TEXT = '$(sync~spin) Refreshing...';
const REFRESH_INTERVAL_MS = 60_000;

export class CursorStatsStatusBar implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private lastUsage: IndividualOverallUsage | undefined;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private refreshInFlight: Promise<void> | undefined;

	constructor(private readonly auth: AuthProvider) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.statusBarItem.show();
	}

	async initialize(): Promise<void> {
		if (await this.auth.isAuthenticated()) {
			await this.refresh();
			this.startAutoRefresh();
			return;
		}

		this.showDisconnected();
	}

	async connect(): Promise<void> {
		const connected = await this.auth.connect();
		if (!connected) {
			this.showDisconnected();
			return;
		}

		await this.refresh();
		this.startAutoRefresh();
	}

	async disconnect(): Promise<void> {
		this.stopAutoRefresh();
		this.lastUsage = undefined;
		await this.auth.disconnect();
		this.showDisconnected();
		void vscode.window.showInformationMessage('Cursor Stats: Account disconnected');
	}

	async refresh(): Promise<void> {
		if (this.refreshInFlight) {
			return this.refreshInFlight;
		}

		this.refreshInFlight = this.doRefresh().finally(() => {
			this.refreshInFlight = undefined;
		});

		return this.refreshInFlight;
	}

	private async doRefresh(): Promise<void> {
		log('Refresh command started');

		if (!(await this.auth.isAuthenticated())) {
			this.stopAutoRefresh();
			this.lastUsage = undefined;
			this.showDisconnected();
			void vscode.window.showWarningMessage(
				'Cursor Stats: Not connected. Connect your account first.'
			);
			return;
		}

		this.statusBarItem.text = REFRESHING_TEXT;
		this.statusBarItem.command = REFRESH_COMMAND;

		try {
			const usage = await fetchIndividualUsage(this.auth);
			this.lastUsage = usage;
			this.showUsage(usage);
			log(
				`Usage updated: ${formatCentsAsUsd(usage.usedCents)} / ${formatCentsAsUsd(usage.limitCents)}`
			);
		} catch (error) {
			logError('Refresh failed:', error);

			if (this.lastUsage) {
				this.showUsage(this.lastUsage);
				return;
			}

			this.statusBarItem.text = '⚡ Usage unavailable';
			this.statusBarItem.tooltip = 'Failed to load usage — click to retry';
			this.statusBarItem.command = REFRESH_COMMAND;
		}
	}

	private startAutoRefresh(): void {
		this.stopAutoRefresh();
		this.refreshTimer = setInterval(() => {
			void this.refresh();
		}, REFRESH_INTERVAL_MS);
	}

	private stopAutoRefresh(): void {
		if (this.refreshTimer !== undefined) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private showDisconnected(): void {
		this.statusBarItem.text = DISCONNECTED_TEXT;
		this.statusBarItem.tooltip = 'Connect your Cursor account';
		this.statusBarItem.command = CONNECT_COMMAND;
	}

	private showUsage(usage: IndividualOverallUsage): void {
		const used = formatCentsAsUsd(usage.usedCents);
		const limit = formatCentsAsUsd(usage.limitCents);
		const remaining = formatCentsAsUsd(usage.remainingCents);
		const cycleStart = formatBillingDay(usage.billingCycleStart);
		const cycleEnd = formatBillingDay(usage.billingCycleEnd);

		this.statusBarItem.text = `⚡ ${used} / ${limit}`;
		this.statusBarItem.tooltip = [
			'Cursor Stats',
			'',
			`Used: ${used}`,
			`Limit: ${limit}`,
			`Remaining: ${remaining}`,
			'',
			`Billing Cycle: ${cycleStart} → ${cycleEnd}`,
			'',
			'Click to refresh',
		].join('\n');
		this.statusBarItem.command = REFRESH_COMMAND;
	}

	dispose(): void {
		this.stopAutoRefresh();
		this.statusBarItem.dispose();
	}
}
