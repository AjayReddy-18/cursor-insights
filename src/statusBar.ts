import * as vscode from 'vscode';
import { formatBillingDay, formatCentsAsUsd } from './api/format';
import { CONNECT_COMMAND, OPEN_INSIGHTS_COMMAND } from './commands';
import type { UsageModel } from './models/usageModel';
import type { UsageService, UsageServiceState } from './services/usageService';

const DISCONNECTED_TEXT = '⚠ Connect Cursor';
const REFRESHING_TEXT = '$(sync~spin) Refreshing...';
const UNAVAILABLE_TEXT = '💰 Usage unavailable';

/** Near the Git branch on the left (SCM uses priority ~100). */
const STATUS_BAR_PRIORITY = 90;

export class CursorInsightsStatusBar implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly subscription: vscode.Disposable;

	constructor(private readonly usageService: UsageService) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			STATUS_BAR_PRIORITY
		);
		this.statusBarItem.show();

		this.subscription = this.usageService.onDidChange((usage, state) => {
			this.render(usage, state);
		});
	}

	private render(usage: UsageModel | undefined, state: UsageServiceState): void {
		if (state === 'disconnected') {
			this.statusBarItem.text = DISCONNECTED_TEXT;
			this.statusBarItem.tooltip = 'Connect your Cursor account';
			this.statusBarItem.command = CONNECT_COMMAND;
			return;
		}

		if (state === 'loading' && !usage) {
			this.statusBarItem.text = REFRESHING_TEXT;
			this.statusBarItem.tooltip = 'Loading Cursor usage…';
			this.statusBarItem.command = OPEN_INSIGHTS_COMMAND;
			return;
		}

		if (!usage) {
			this.statusBarItem.text = UNAVAILABLE_TEXT;
			this.statusBarItem.tooltip = 'Failed to load usage — click to open Cursor Insights';
			this.statusBarItem.command = OPEN_INSIGHTS_COMMAND;
			return;
		}

		const used = formatCentsAsUsd(usage.usedCents);
		const limit = formatCentsAsUsd(usage.limitCents);
		const remaining = formatCentsAsUsd(usage.remainingCents);
		const cycleStart = formatBillingDay(usage.billingCycleStart);
		const cycleEnd = formatBillingDay(usage.billingCycleEnd);

		this.statusBarItem.text = `💰 ${used}`;
		this.statusBarItem.tooltip = [
			'Cursor Insights',
			'',
			'Monthly Usage',
			'',
			`Used:\n${used}`,
			'',
			`Limit:\n${limit}`,
			'',
			`Remaining:\n${remaining}`,
			'',
			`Billing Cycle:\n${cycleStart} → ${cycleEnd}`,
			'',
			'Click to open Cursor Insights.',
		].join('\n');
		this.statusBarItem.command = OPEN_INSIGHTS_COMMAND;
	}

	dispose(): void {
		this.subscription.dispose();
		this.statusBarItem.dispose();
	}
}
