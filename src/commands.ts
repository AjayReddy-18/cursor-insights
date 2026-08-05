/** Command IDs — keep the `cursor-insights.*` prefix (extension identifier). */
export const CONNECT_COMMAND = 'cursor-insights.connect';
export const REFRESH_COMMAND = 'cursor-insights.refresh';
export const OPEN_INSIGHTS_COMMAND = 'cursor-insights.openInsights';
export const OPEN_DASHBOARD_COMMAND = 'cursor-insights.openDashboard';
export const SHOW_LOGS_COMMAND = 'cursor-insights.showLogs';

/** Activity Bar view container id registered in package.json. */
export const INSIGHTS_CONTAINER_ID = 'cursor-insights';

/** Webview view id registered in package.json. */
export const INSIGHTS_VIEW_ID = 'cursorInsights.dashboard';

/** Reveal the Cursor Insights Activity Bar container. */
export const OPEN_INSIGHTS_CONTAINER_COMMAND = `workbench.view.extension.${INSIGHTS_CONTAINER_ID}`;

export const CURSOR_USAGE_DASHBOARD_URL =
	'https://cursor.com/dashboard/usage';
