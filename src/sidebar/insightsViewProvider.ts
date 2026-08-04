import * as vscode from 'vscode';
import { formatBillingDay, formatCentsAsUsd } from '../api/format';
import {
	CONNECT_COMMAND,
	CURSOR_USAGE_DASHBOARD_URL,
	INSIGHTS_VIEW_ID,
	OPEN_DASHBOARD_COMMAND,
	REFRESH_COMMAND,
} from '../commands';
import {
	ALERT_THRESHOLD_MAX,
	ALERT_THRESHOLD_MIN,
	getAlertThreshold,
	setAlertThreshold,
} from '../config';
import type { UsageModel } from '../models/usageModel';
import type { UsageService, UsageServiceState } from '../services/usageService';

type WebviewMessage =
	| { type: 'refresh' }
	| { type: 'openDashboard' }
	| { type: 'reconnect' }
	| { type: 'setAlertThreshold'; value: number };

/**
 * Explorer sidebar dashboard. Receives a typed UsageModel from UsageService —
 * never calls the API directly.
 */
export class InsightsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = INSIGHTS_VIEW_ID;

	private view: vscode.WebviewView | undefined;
	private readonly subscription: vscode.Disposable;

	constructor(private readonly usageService: UsageService) {
		this.subscription = this.usageService.onDidChange((usage, state) => {
			this.render(usage, state);
		});
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
			void this.handleMessage(message);
		});

		this.render(this.usageService.getCurrentUsage(), this.usageService.getState());
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		switch (message.type) {
			case 'refresh':
				await vscode.commands.executeCommand(REFRESH_COMMAND);
				break;
			case 'openDashboard':
				await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
				break;
			case 'reconnect':
				await vscode.commands.executeCommand(CONNECT_COMMAND);
				break;
			case 'setAlertThreshold':
				if (typeof message.value === 'number') {
					await setAlertThreshold(message.value);
				}
				break;
		}
	}

	private render(usage: UsageModel | undefined, state: UsageServiceState): void {
		if (!this.view) {
			return;
		}

		this.view.webview.html = this.getHtml(this.view.webview, usage, state);
	}

	private getHtml(
		webview: vscode.Webview,
		usage: UsageModel | undefined,
		state: UsageServiceState
	): string {
		const nonce = getNonce();
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		const body = this.getBody(usage, state);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Cursor Insights</title>
	<style>
		:root {
			color-scheme: light dark;
		}
		body {
			margin: 0;
			padding: 10px 16px 16px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			font-weight: var(--vscode-font-weight);
			color: var(--vscode-foreground);
			background: transparent;
			line-height: 1.45;
		}
		.section {
			padding: 12px 0;
			border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, rgba(128,128,128,0.35)));
		}
		.section:last-child {
			border-bottom: none;
		}
		.header-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin: 0 0 8px;
		}
		.section-title {
			margin: 0;
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.refresh-action {
			margin: 0;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--vscode-descriptionForeground);
			font: inherit;
			font-size: 14px;
			line-height: 1;
			cursor: pointer;
			opacity: 0.8;
		}
		.refresh-action:hover {
			color: var(--vscode-foreground);
			opacity: 1;
		}
		.refresh-action:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}
		.refresh-action:disabled {
			cursor: default;
			opacity: 0.6;
		}
		.refresh-action.spinning {
			animation: spin 0.8s linear infinite;
		}
		@keyframes spin {
			from { transform: rotate(0deg); }
			to { transform: rotate(360deg); }
		}
		.amount {
			margin: 0 0 8px;
			font-size: 13px;
			font-weight: 400;
			font-variant-numeric: tabular-nums;
			color: var(--vscode-foreground);
		}
		.meta {
			margin: 8px 0 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		.progress {
			height: 4px;
			border-radius: 2px;
			background: var(--vscode-editorWidget-background, rgba(128,128,128,0.25));
			overflow: hidden;
		}
		.progress-fill {
			height: 100%;
			border-radius: 2px;
			background: var(--vscode-progressBar-background, var(--vscode-button-background));
			width: 0%;
			transition: width 0.25s ease;
		}
		.actions {
			display: flex;
			flex-direction: column;
			gap: 6px;
			align-items: flex-start;
		}
		.link-action {
			margin: 0;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--vscode-textLink-foreground);
			font: inherit;
			font-size: 13px;
			text-align: left;
			cursor: pointer;
			text-decoration: none;
		}
		.link-action:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}
		.link-action:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}
		.status-msg {
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		.status-msg.error {
			color: var(--vscode-errorForeground);
		}
		.threshold-value {
			margin: 0 0 10px;
			font-size: 13px;
			font-variant-numeric: tabular-nums;
			color: var(--vscode-foreground);
		}
		.threshold-slider {
			width: 100%;
			margin: 0;
			accent-color: var(--vscode-progressBar-background, var(--vscode-button-background));
			cursor: pointer;
		}
	</style>
</head>
<body>
	${body}
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.querySelectorAll('[data-action]').forEach((el) => {
			el.addEventListener('click', () => {
				if (el.disabled) {
					return;
				}
				vscode.postMessage({ type: el.getAttribute('data-action') });
			});
		});

		const slider = document.getElementById('alert-threshold');
		const valueLabel = document.getElementById('alert-threshold-value');
		if (slider && valueLabel) {
			const formatUsd = (value) =>
				new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}).format(Number(value));

			slider.addEventListener('input', () => {
				valueLabel.textContent = formatUsd(slider.value);
				vscode.postMessage({
					type: 'setAlertThreshold',
					value: Number(slider.value),
				});
			});
		}
	</script>
</body>
</html>`;
	}

	private getBody(usage: UsageModel | undefined, state: UsageServiceState): string {
		const refreshing = state === 'loading';

		if (state === 'disconnected') {
			return `
				<div class="section">
					<div class="header-row">
						<p class="section-title">Monthly Usage</p>
					</div>
					<p class="status-msg">Connect your Cursor account to see usage.</p>
				</div>
				${this.alertThresholdSection()}
				<div class="section">
					<div class="actions">
						<button class="link-action" data-action="reconnect">Connect Account</button>
					</div>
				</div>`;
		}

		if (!usage) {
			const msg =
				state === 'loading'
					? 'Loading usage…'
					: 'Usage unavailable. Try refreshing.';
			const errorClass = state === 'error' ? ' error' : '';
			return `
				<div class="section">
					${this.headerRow(refreshing)}
					<p class="status-msg${errorClass}">${escapeHtml(msg)}</p>
				</div>
				${this.alertThresholdSection()}
				${this.actionsSection()}`;
		}

		const used = formatCentsAsUsd(usage.usedCents);
		const limit = formatCentsAsUsd(usage.limitCents);
		const percent = Math.min(100, Math.max(0, usage.percentUsed));
		const percentLabel = `${percent.toFixed(2)}%`;
		const resets = formatBillingDay(usage.billingCycleEnd);
		const errorNote =
			state === 'error'
				? `<p class="status-msg error">Last refresh failed — showing cached data.</p>`
				: '';

		return `
			<div class="section">
				${this.headerRow(refreshing)}
				<p class="amount">${escapeHtml(used)} / ${escapeHtml(limit)} (${escapeHtml(percentLabel)})</p>
				<div class="progress" role="progressbar" aria-valuenow="${percent.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
					<div class="progress-fill" style="width: ${percent.toFixed(2)}%"></div>
				</div>
				<p class="meta">Resets ${escapeHtml(resets)}</p>
				${errorNote}
			</div>
			${this.alertThresholdSection()}
			${this.actionsSection()}`;
	}

	private headerRow(refreshing: boolean): string {
		const spinClass = refreshing ? ' spinning' : '';
		const disabled = refreshing ? ' disabled' : '';
		return `
			<div class="header-row">
				<p class="section-title">Monthly Usage</p>
				<button class="refresh-action${spinClass}" data-action="refresh" title="Refresh"${disabled} aria-label="Refresh">⟳</button>
			</div>`;
	}

	private alertThresholdSection(): string {
		const threshold = getAlertThreshold();
		const label = formatCentsAsUsd(Math.round(threshold * 100));
		return `
			<div class="section">
				<p class="section-title">Alert Threshold</p>
				<p class="threshold-value" id="alert-threshold-value">${escapeHtml(label)}</p>
				<input
					class="threshold-slider"
					id="alert-threshold"
					type="range"
					min="${ALERT_THRESHOLD_MIN}"
					max="${ALERT_THRESHOLD_MAX}"
					step="0.5"
					value="${threshold}"
					aria-label="Alert threshold in US dollars"
				/>
			</div>`;
	}

	private actionsSection(): string {
		return `
			<div class="section">
				<div class="actions">
					<button class="link-action" data-action="openDashboard">Open Cursor Usage Dashboard</button>
					<button class="link-action" data-action="reconnect">Reconnect Account</button>
				</div>
			</div>`;
	}

	dispose(): void {
		this.subscription.dispose();
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}

/** Open the Cursor usage dashboard in the system browser. */
export async function openCursorUsageDashboard(): Promise<void> {
	await vscode.env.openExternal(vscode.Uri.parse(CURSOR_USAGE_DASHBOARD_URL));
}
