import * as vscode from 'vscode';
import { dumpCookies } from './dumpCookies';
import { initLogger, log, showLogs } from './logger';
import { CursorStatsStatusBar, REFRESH_COMMAND } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
	initLogger(context);
	log('Extension activated');
	showLogs();

	const statusBar = new CursorStatsStatusBar();

	const refreshCommand = vscode.commands.registerCommand(
		REFRESH_COMMAND,
		() => statusBar.refresh()
	);

	const dumpCookiesCommand = vscode.commands.registerCommand(
		'cursor-stats.dumpCookies',
		() => dumpCookies()
	);

	const showLogsCommand = vscode.commands.registerCommand(
		'cursor-stats.showLogs',
		() => showLogs()
	);

	context.subscriptions.push(
		statusBar,
		refreshCommand,
		dumpCookiesCommand,
		showLogsCommand
	);
}

export function deactivate(): void {}
