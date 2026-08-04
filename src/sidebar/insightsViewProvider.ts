import * as vscode from 'vscode';
import { formatBillingDay, formatCentsAsUsd } from '../api/format';
import {
	CONNECT_COMMAND,
	CURSOR_USAGE_DASHBOARD_URL,
	INSIGHTS_VIEW_ID,
	OPEN_DASHBOARD_COMMAND,
	REFRESH_COMMAND,
} from '../commands';
import type { UsageModel } from '../models/usageModel';
import type { UsageService, UsageServiceState } from '../services/usageService';

type WebviewMessage =
	| { type: 'refresh' }
	| { type: 'openDashboard' }
	| { type: 'reconnect' };

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
			padding: 12px 14px 20px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			font-weight: var(--vscode-font-weight);
			color: var(--vscode-foreground);
			background: transparent;
			line-height: 1.4;
		}
		.section {
			padding: 12px 0;
			border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,0.35)));
		}
		.section:last-child {
			border-bottom: none;
		}
		.section-title {
			margin: 0 0 8px;
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.amount {
			margin: 0 0 10px;
			font-size: 18px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}
		.amount.muted {
			font-size: 15px;
			font-weight: 500;
			color: var(--vscode-descriptionForeground);
		}
		.meta {
			margin: 8px 0 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		.progress {
			height: 6px;
			border-radius: 3px;
			background: var(--vscode-editorWidget-background, rgba(128,128,128,0.25));
			overflow: hidden;
		}
		.progress-fill {
			height: 100%;
			border-radius: 3px;
			background: var(--vscode-progressBar-background, var(--vscode-button-background));
			width: 0%;
			transition: width 0.25s ease;
		}
		.percent {
			margin: 6px 0 0;
			font-size: 12px;
			font-variant-numeric: tabular-nums;
			color: var(--vscode-descriptionForeground);
		}
		.placeholder {
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			font-style: italic;
		}
		.actions {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		button.action {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			padding: 6px 10px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 2px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			font: inherit;
			text-align: left;
			cursor: pointer;
		}
		button.action:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		button.action:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 1px;
		}
		button.action.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-border, transparent);
		}
		button.action.primary:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.status-msg {
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		.status-msg.error {
			color: var(--vscode-errorForeground);
		}
	</style>
</head>
<body>
	${body}
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.querySelectorAll('[data-action]').forEach((el) => {
			el.addEventListener('click', () => {
				vscode.postMessage({ type: el.getAttribute('data-action') });
			});
		});
	</script>
</body>
</html>`;
	}

	private getBody(usage: UsageModel | undefined, state: UsageServiceState): string {
		if (state === 'disconnected') {
			return `
				<div class="section">
					<p class="section-title">Cursor Insights</p>
					<p class="status-msg">Connect your Cursor account to see usage.</p>
				</div>
				<div class="section">
					<p class="section-title">Quick Actions</p>
					<div class="actions">
						<button class="action primary" data-action="reconnect">🔐 Connect Account</button>
					</div>
				</div>
				${this.placeholderSections()}`;
		}

		if (!usage) {
			const msg =
				state === 'loading'
					? 'Loading usage…'
					: 'Usage unavailable. Try refreshing.';
			const errorClass = state === 'error' ? ' error' : '';
			return `
				<div class="section">
					<p class="section-title">💰 Monthly Usage</p>
					<p class="status-msg${errorClass}">${escapeHtml(msg)}</p>
				</div>
				${this.actionsSection(state === 'loading')}
				${this.placeholderSections()}`;
		}

		const used = formatCentsAsUsd(usage.usedCents);
		const limit = formatCentsAsUsd(usage.limitCents);
		const percent = Math.min(100, Math.max(0, usage.percentUsed));
		const percentLabel = `${percent.toFixed(2)}%`;
		const resets = formatBillingDay(usage.billingCycleEnd);
		const loadingNote =
			state === 'loading'
				? `<p class="meta">Refreshing…</p>`
				: state === 'error'
					? `<p class="status-msg error">Last refresh failed — showing cached data.</p>`
					: '';

		return `
			<div class="section">
				<p class="section-title">💰 Monthly Usage</p>
				<p class="amount">${escapeHtml(used)} / ${escapeHtml(limit)}</p>
				<div class="progress" role="progressbar" aria-valuenow="${percent.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
					<div class="progress-fill" style="width: ${percent.toFixed(2)}%"></div>
				</div>
				<p class="percent">${escapeHtml(percentLabel)}</p>
				<p class="meta">Resets: ${escapeHtml(resets)}</p>
				${loadingNote}
			</div>

			<div class="section">
				<p class="section-title">Today's Spend</p>
				<p class="amount muted">$0.00</p>
				<p class="placeholder">Placeholder</p>
			</div>

			${this.actionsSection(state === 'loading')}

			${this.placeholderSections()}`;
	}

	private actionsSection(loading: boolean): string {
		const refreshLabel = loading ? '🔄 Refreshing…' : '🔄 Refresh';
		return `
			<div class="section">
				<p class="section-title">Quick Actions</p>
				<div class="actions">
					<button class="action" data-action="refresh"${loading ? ' disabled' : ''}>${refreshLabel}</button>
					<button class="action" data-action="openDashboard">🌐 Open Cursor Usage Dashboard</button>
					<button class="action" data-action="reconnect">🔐 Reconnect Account</button>
				</div>
			</div>`;
	}

	private placeholderSections(): string {
		return `
			<div class="section">
				<p class="section-title">Recent Usage</p>
				<p class="placeholder">Coming Soon</p>
			</div>
			<div class="section">
				<p class="section-title">Model Breakdown</p>
				<p class="placeholder">Coming Soon</p>
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
