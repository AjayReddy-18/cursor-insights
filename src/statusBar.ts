import * as vscode from 'vscode';

export const REFRESH_COMMAND = 'cursor-stats.refresh';

const LOADING_TEXT = '⚡ Cursor Usage: Loading...';
const REFRESHING_TEXT = '$(sync~spin) Refreshing...';

export class CursorStatsStatusBar implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private refreshTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.statusBarItem.text = LOADING_TEXT;
		this.statusBarItem.tooltip = 'Refresh Cursor usage';
		this.statusBarItem.command = REFRESH_COMMAND;
		this.statusBarItem.show();
	}

	async refresh(): Promise<void> {
		this.clearRefreshTimeout();
		this.statusBarItem.text = REFRESHING_TEXT;

		await new Promise<void>((resolve) => {
			this.refreshTimeout = setTimeout(() => {
				this.refreshTimeout = undefined;
				resolve();
			}, 1000);
		});

		this.statusBarItem.text = LOADING_TEXT;
	}

	dispose(): void {
		this.clearRefreshTimeout();
		this.statusBarItem.dispose();
	}

	private clearRefreshTimeout(): void {
		if (this.refreshTimeout !== undefined) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = undefined;
		}
	}
}
