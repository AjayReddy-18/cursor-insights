import * as vscode from 'vscode';
import { LocalCursorAuthProvider } from './auth/localCursorAuthProvider';
import {
	CONNECT_COMMAND,
	INSIGHTS_VIEW_ID,
	OPEN_DASHBOARD_COMMAND,
	OPEN_INSIGHTS_COMMAND,
	OPEN_INSIGHTS_CONTAINER_COMMAND,
	REFRESH_COMMAND,
	SHOW_LOGS_COMMAND,
} from './commands';
import {
	getConversationMetric,
	getConversationTimeframe,
} from './config';
import { initLogger, log, showLogs } from './logger';
import { ConversationInsightsService } from './services/conversationInsightsService';
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
	const conversationInsightsService = new ConversationInsightsService(auth);
	conversationInsightsService.setMetric(getConversationMetric());
	const highCostAlertService = new HighCostAlertService(auth);
	const statusBar = new CursorInsightsStatusBar(usageService);
	const dashboard = new InsightsViewProvider(
		usageService,
		recentRequestsService,
		conversationInsightsService
	);

	const refreshAll = async (): Promise<void> => {
		await Promise.all([
			usageService.refresh(),
			recentRequestsService.refresh(),
			conversationInsightsService.refresh(getConversationTimeframe()),
			highCostAlertService.initialize(),
		]);
	};

	context.subscriptions.push(
		usageService,
		recentRequestsService,
		conversationInsightsService,
		highCostAlertService,
		statusBar,
		dashboard,
		vscode.window.registerWebviewViewProvider(INSIGHTS_VIEW_ID, dashboard, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand(CONNECT_COMMAND, async () => {
			await usageService.initialize();
			if (await usageService.isAuthenticated()) {
				await refreshAll();
				return;
			}
			void vscode.window.showWarningMessage(
				'Cursor Insights: Sign in to Cursor on this machine, then Connect Account again.'
			);
		}),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => refreshAll()),
		vscode.commands.registerCommand(OPEN_INSIGHTS_COMMAND, async () => {
			await vscode.commands.executeCommand(OPEN_INSIGHTS_CONTAINER_COMMAND);
			await vscode.commands.executeCommand(`${INSIGHTS_VIEW_ID}.focus`);
			await refreshAll();
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
