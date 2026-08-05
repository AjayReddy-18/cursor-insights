import * as vscode from 'vscode';
import { LocalCursorAuthProvider } from './auth/localCursorAuthProvider';
import {
	INSIGHTS_VIEW_ID,
	OPEN_DASHBOARD_COMMAND,
	OPEN_INSIGHTS_COMMAND,
	REFRESH_COMMAND,
	SHOW_LOGS_COMMAND,
} from './commands';
import { initLogger, log, showLogs } from './logger';
import { HighCostAlertService } from './services/highCostAlertService';
import { RecentRequestsService } from './services/recentRequestsService';
import { UsageService } from './services/usageService';
import {
	InsightsViewProvider,
	openCursorUsageDashboard,
} from './sidebar/insightsViewProvider';
import { CursorInsightsStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
	initLogger(context);
	log('Extension activated');

	const auth = new LocalCursorAuthProvider();
	const usageService = new UsageService(auth);
	const recentRequestsService = new RecentRequestsService(auth);
	const highCostAlertService = new HighCostAlertService(auth);
	const statusBar = new CursorInsightsStatusBar(usageService);
	const sidebar = new InsightsViewProvider(usageService, recentRequestsService);

	context.subscriptions.push(
		usageService,
		recentRequestsService,
		highCostAlertService,
		statusBar,
		sidebar,
		vscode.window.registerWebviewViewProvider(INSIGHTS_VIEW_ID, sidebar),
		vscode.commands.registerCommand(REFRESH_COMMAND, async () => {
			await Promise.all([
				usageService.refresh(),
				recentRequestsService.refresh(),
				highCostAlertService.initialize(),
			]);
		}),
		vscode.commands.registerCommand(OPEN_INSIGHTS_COMMAND, async () => {
			await vscode.commands.executeCommand(`${INSIGHTS_VIEW_ID}.focus`);
			await Promise.all([
				usageService.refresh(),
				recentRequestsService.refresh(),
				highCostAlertService.initialize(),
			]);
		}),
		vscode.commands.registerCommand(OPEN_DASHBOARD_COMMAND, () =>
			openCursorUsageDashboard()
		),
		vscode.commands.registerCommand(SHOW_LOGS_COMMAND, () => showLogs())
	);

	void usageService.initialize();
	void highCostAlertService.initialize();
}

export function deactivate(): void {}
