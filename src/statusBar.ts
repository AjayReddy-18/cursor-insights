import * as vscode from 'vscode';
import { testApiConnection } from './api/client';
import { log } from './logger';

export const REFRESH_COMMAND = 'cursor-stats.refresh';

const LOADING_TEXT = '⚡ Cursor Usage: Loading...';
const REFRESHING_TEXT = '$(sync~spin) Refreshing...';

export class CursorStatsStatusBar implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;

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
		log('Refresh command started');
		this.statusBarItem.text = REFRESHING_TEXT;

		try {
			await testApiConnection();
			this.statusBarItem.text = '✅ Connected';
		} catch (error) {
			const status = error instanceof Error ? error.message : 'Error';
			this.statusBarItem.text = `❌ ${status}`;
		}
	}

	dispose(): void {
		this.statusBarItem.dispose();
	}
}
