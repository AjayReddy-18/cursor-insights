import * as vscode from 'vscode';
import { fetchIndividualUsage } from '../api/client';
import { formatCentsAsUsd } from '../api/format';
import type { AuthProvider } from '../auth/types';
import { log, logError } from '../logger';
import { toUsageModel, type UsageModel } from '../models/usageModel';

const REFRESH_INTERVAL_MS = 60_000;

export type UsageChangeListener = (
	usage: UsageModel | undefined,
	state: UsageServiceState
) => void;

export type UsageServiceState =
	| 'disconnected'
	| 'loading'
	| 'ready'
	| 'error';

/**
 * Owns auth-aware usage fetching and broadcasts updates to StatusBar + Sidebar.
 */
export class UsageService implements vscode.Disposable {
	private usage: UsageModel | undefined;
	private state: UsageServiceState = 'disconnected';
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private refreshInFlight: Promise<UsageModel | undefined> | undefined;
	private readonly listeners = new Set<UsageChangeListener>();

	constructor(private readonly auth: AuthProvider) {}

	getCurrentUsage(): UsageModel | undefined {
		return this.usage;
	}

	getState(): UsageServiceState {
		return this.state;
	}

	onDidChange(listener: UsageChangeListener): vscode.Disposable {
		this.listeners.add(listener);
		return new vscode.Disposable(() => {
			this.listeners.delete(listener);
		});
	}

	async initialize(): Promise<void> {
		if (await this.auth.isAuthenticated()) {
			await this.refresh();
			this.startAutoRefresh();
			return;
		}

		this.setState(undefined, 'disconnected');
	}

	async connect(): Promise<boolean> {
		const connected = await this.auth.connect();
		if (!connected) {
			this.setState(undefined, 'disconnected');
			return false;
		}

		await this.refresh();
		this.startAutoRefresh();
		return true;
	}

	async disconnect(): Promise<void> {
		this.stopAutoRefresh();
		await this.auth.disconnect();
		this.setState(undefined, 'disconnected');
		void vscode.window.showInformationMessage('Cursor Insights: Account disconnected');
	}

	async isAuthenticated(): Promise<boolean> {
		return this.auth.isAuthenticated();
	}

	async refresh(): Promise<UsageModel | undefined> {
		if (this.refreshInFlight) {
			return this.refreshInFlight;
		}

		this.refreshInFlight = this.doRefresh().finally(() => {
			this.refreshInFlight = undefined;
		});

		return this.refreshInFlight;
	}

	private async doRefresh(): Promise<UsageModel | undefined> {
		log('Refresh started');

		if (!(await this.auth.isAuthenticated())) {
			this.stopAutoRefresh();
			this.setState(undefined, 'disconnected');
			void vscode.window.showWarningMessage(
				'Cursor Insights: Not connected. Connect your account first.'
			);
			return undefined;
		}

		this.setState(this.usage, 'loading');

		try {
			const raw = await fetchIndividualUsage(this.auth);
			const model = toUsageModel(raw);
			this.setState(model, 'ready');
			log(
				`Usage updated: ${formatCentsAsUsd(model.usedCents)} / ${formatCentsAsUsd(model.limitCents)}`
			);
			return model;
		} catch (error) {
			logError('Refresh failed:', error);

			if (this.usage) {
				this.setState(this.usage, 'error');
				return this.usage;
			}

			this.setState(undefined, 'error');
			return undefined;
		}
	}

	private setState(usage: UsageModel | undefined, state: UsageServiceState): void {
		this.usage = usage;
		this.state = state;
		for (const listener of this.listeners) {
			listener(usage, state);
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

	dispose(): void {
		this.stopAutoRefresh();
		this.listeners.clear();
	}
}
