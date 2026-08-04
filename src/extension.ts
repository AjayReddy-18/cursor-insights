import * as vscode from 'vscode';
import { ManualSessionProvider } from './auth/manualSessionProvider';
import {
	CONNECT_COMMAND,
	DISCONNECT_COMMAND,
	DUMP_COOKIES_COMMAND,
	INSIGHTS_VIEW_ID,
	OPEN_DASHBOARD_COMMAND,
	OPEN_INSIGHTS_COMMAND,
	REFRESH_COMMAND,
	SHOW_LOGS_COMMAND,
} from './commands';
import { dumpCookies } from './dumpCookies';
import { initLogger, log, showLogs } from './logger';
import { UsageService } from './services/usageService';
import {
	InsightsViewProvider,
	openCursorUsageDashboard,
} from './sidebar/insightsViewProvider';
import { CursorInsightsStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
	initLogger(context);
	log('Extension activated');

	// Swap ManualSessionProvider for Cursor CLI / OAuth later without changing the rest.
	const auth = new ManualSessionProvider(context.secrets);
	const usageService = new UsageService(auth);
	const statusBar = new CursorInsightsStatusBar(usageService);
	const sidebar = new InsightsViewProvider(usageService);

	context.subscriptions.push(
		usageService,
		statusBar,
		sidebar,
		vscode.window.registerWebviewViewProvider(INSIGHTS_VIEW_ID, sidebar),
		vscode.commands.registerCommand(CONNECT_COMMAND, () => usageService.connect()),
		vscode.commands.registerCommand(DISCONNECT_COMMAND, () => usageService.disconnect()),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => usageService.refresh()),
		vscode.commands.registerCommand(OPEN_INSIGHTS_COMMAND, async () => {
			await vscode.commands.executeCommand(`${INSIGHTS_VIEW_ID}.focus`);
			await usageService.refresh();
		}),
		vscode.commands.registerCommand(OPEN_DASHBOARD_COMMAND, () =>
			openCursorUsageDashboard()
		),
		vscode.commands.registerCommand(DUMP_COOKIES_COMMAND, () => dumpCookies()),
		vscode.commands.registerCommand(SHOW_LOGS_COMMAND, () => showLogs())
	);

	void usageService.initialize();
}

export function deactivate(): void {}
