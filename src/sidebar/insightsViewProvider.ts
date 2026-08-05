import * as vscode from 'vscode';
import { formatBillingDay, formatCentsAsUsd } from '../api/format';
import {
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
import type { RecentRequest } from '../models/recentRequest';
import type { UsageModel } from '../models/usageModel';
import type {
	RecentRequestsService,
	RecentRequestsServiceState,
} from '../services/recentRequestsService';
import type { UsageService, UsageServiceState } from '../services/usageService';

type WebviewMessage =
	| { type: 'refresh' }
	| { type: 'openDashboard' }
	| { type: 'setAlertThreshold'; value: number };

/**
 * Explorer sidebar dashboard. Receives typed models from services —
 * never calls the API directly.
 */
export class InsightsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = INSIGHTS_VIEW_ID;

	private view: vscode.WebviewView | undefined;
	private readonly subscriptions: vscode.Disposable[] = [];

	constructor(
		private readonly usageService: UsageService,
		private readonly recentRequestsService: RecentRequestsService
	) {
		this.subscriptions.push(
			this.usageService.onDidChange(() => {
				this.renderCurrent();
			}),
			this.recentRequestsService.onDidChange(() => {
				this.renderCurrent();
			})
		);
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

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				void this.recentRequestsService.refresh();
			}
		});

		this.renderCurrent();
		void this.recentRequestsService.refresh();
	}

	private renderCurrent(): void {
		this.render(
			this.usageService.getCurrentUsage(),
			this.usageService.getState(),
			this.recentRequestsService.getRequests(),
			this.recentRequestsService.getState()
		);
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		switch (message.type) {
			case 'refresh':
				await vscode.commands.executeCommand(REFRESH_COMMAND);
				break;
			case 'openDashboard':
				await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
				break;
			case 'setAlertThreshold':
				if (typeof message.value === 'number') {
					await setAlertThreshold(message.value);
				}
				break;
		}
	}

	private render(
		usage: UsageModel | undefined,
		state: UsageServiceState,
		requests: RecentRequest[],
		requestsState: RecentRequestsServiceState
	): void {
		if (!this.view) {
			return;
		}

		this.view.webview.html = this.getHtml(
			this.view.webview,
			usage,
			state,
			requests,
			requestsState
		);
	}

	private getHtml(
		webview: vscode.Webview,
		usage: UsageModel | undefined,
		state: UsageServiceState,
		requests: RecentRequest[],
		requestsState: RecentRequestsServiceState
	): string {
		const nonce = getNonce();
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		const body = this.getBody(usage, state, requests, requestsState);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Cursor Insights</title>
	<style>
		body {
			margin: 0;
			padding: 10px 16px 16px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			font-weight: var(--vscode-font-weight);
			color: var(--vscode-editor-foreground, var(--vscode-foreground));
			background: var(--vscode-sideBar-background, var(--vscode-editor-background));
			line-height: 1.45;
		}
		.section {
			padding: 12px 0;
			border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, var(--vscode-widget-border)));
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
			background: inherit;
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
			background: var(--vscode-input-background, var(--vscode-editorWidget-background));
			overflow: hidden;
		}
		.progress-fill {
			height: 100%;
			border-radius: 2px;
			background: var(--vscode-progressBar-background, var(--vscode-button-background));
			width: 0%;
			transition: width 0.25s ease;
		}
		.requests-table {
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
			font-size: 12px;
		}
		.requests-table th,
		.requests-table td {
			padding: 3px 6px 3px 0;
			vertical-align: top;
			text-align: left;
		}
		.requests-table th:last-child,
		.requests-table td:last-child {
			padding-right: 0;
			text-align: right;
		}
		.requests-table th {
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.02em;
			color: var(--vscode-descriptionForeground);
		}
		.requests-table td {
			color: var(--vscode-foreground);
			font-variant-numeric: tabular-nums;
		}
		.requests-table .col-time {
			width: 28%;
			white-space: nowrap;
			color: var(--vscode-descriptionForeground);
		}
		.requests-table .col-model {
			width: 52%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.requests-table .col-cost {
			width: 20%;
			white-space: nowrap;
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
			background: inherit;
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
			-webkit-appearance: none;
			appearance: none;
			height: 4px;
			border-radius: 2px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			outline: none;
			cursor: pointer;
			accent-color: var(--vscode-progressBar-background, var(--vscode-button-background));
		}
		.threshold-slider:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}
		.threshold-slider::-webkit-slider-thumb {
			-webkit-appearance: none;
			appearance: none;
			width: 14px;
			height: 14px;
			border-radius: 50%;
			background: var(--vscode-button-background);
			border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
			cursor: pointer;
		}
		.threshold-slider::-moz-range-thumb {
			width: 14px;
			height: 14px;
			border-radius: 50%;
			background: var(--vscode-button-background);
			border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
			cursor: pointer;
		}
		.threshold-slider::-moz-range-track {
			height: 4px;
			border-radius: 2px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
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

	private getBody(
		usage: UsageModel | undefined,
		state: UsageServiceState,
		requests: RecentRequest[],
		requestsState: RecentRequestsServiceState
	): string {
		const refreshing = state === 'loading' || requestsState === 'loading';

		if (state === 'disconnected') {
			return `
				<div class="section">
					${this.headerRow(refreshing)}
					<p class="status-msg">Sign in to Cursor on this machine, then Refresh.</p>
				</div>
				${this.alertThresholdSection()}
				${this.actionsSection()}`;
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
				${this.recentRequestsSection(requests, requestsState)}
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
			${this.recentRequestsSection(requests, requestsState)}
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

	private recentRequestsSection(
		requests: RecentRequest[],
		requestsState: RecentRequestsServiceState
	): string {
		if (requestsState === 'disconnected') {
			return '';
		}

		let body: string;
		if (requestsState === 'loading' && requests.length === 0) {
			body = `<p class="status-msg">Loading…</p>`;
		} else if (requestsState === 'error' && requests.length === 0) {
			body = `<p class="status-msg error">Failed to load recent requests.</p>`;
		} else if (requests.length === 0) {
			body = `<p class="status-msg">No recent requests found.</p>`;
		} else {
			const rows = requests
				.map(
					(request) => `
				<tr>
					<td class="col-time">${escapeHtml(request.time)}</td>
					<td class="col-model" title="${escapeHtml(request.model)}">${escapeHtml(request.model)}</td>
					<td class="col-cost">${escapeHtml(request.cost)}</td>
				</tr>`
				)
				.join('');
			body = `
				<table class="requests-table">
					<thead>
						<tr>
							<th class="col-time">Time</th>
							<th class="col-model">Model</th>
							<th class="col-cost">Cost</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>`;
		}

		const errorNote =
			requestsState === 'error' && requests.length > 0
				? `<p class="status-msg error">Last refresh failed — showing cached data.</p>`
				: '';

		return `
			<div class="section">
				<p class="section-title">Recent Requests</p>
				${body}
				${errorNote}
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
				</div>
			</div>`;
	}

	dispose(): void {
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
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
