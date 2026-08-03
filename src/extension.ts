import * as vscode from 'vscode';
import { ManualSessionProvider } from './auth/manualSessionProvider';
import { dumpCookies } from './dumpCookies';
import { initLogger, log, showLogs } from './logger';
import {
	CONNECT_COMMAND,
	CursorStatsStatusBar,
	DISCONNECT_COMMAND,
	REFRESH_COMMAND,
} from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
	initLogger(context);
	log('Extension activated');
	showLogs();

	// Swap ManualSessionProvider for Cursor CLI / OAuth later without changing the rest.
	const auth = new ManualSessionProvider(context.secrets);
	const statusBar = new CursorStatsStatusBar(auth);

	context.subscriptions.push(
		statusBar,
		vscode.commands.registerCommand(CONNECT_COMMAND, () => statusBar.connect()),
		vscode.commands.registerCommand(DISCONNECT_COMMAND, () => statusBar.disconnect()),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => statusBar.refresh()),
		vscode.commands.registerCommand('cursor-stats.dumpCookies', () => dumpCookies()),
		vscode.commands.registerCommand('cursor-stats.showLogs', () => showLogs())
	);

	void statusBar.initialize();
}

export function deactivate(): void {}
