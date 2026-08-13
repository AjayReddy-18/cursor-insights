# Change Log

All notable changes to the "Cursor Insights" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

# 1.3.0

### Fixed

- **Prompt Specificity** now correctly reads from `conversation-segments.guidance_level_distribution` instead of `conversation-classification.guidance_level_distribution`. Percentages are calculated from the raw counts returned by the API (e.g. high=65, medium=5, low=5 → High=86.7%, Medium=6.7%, Low=6.7%).
- Multi-window alert delivery: alerts are now reliably targeted at the focused Cursor window at the moment a threshold crossing is detected. Non-targeted windows are skipped even if they are also focused.
- Test reliability: leadership handoff tests no longer race against the asynchronous `releaseLeadership()` call issued by `dispose()`.

# 1.2.0

### Added


- **Conversation Insights** in the Activity Bar dashboard, with a doughnut chart for your selected metric
- Timeframe controls for Conversation Insights (`1D`, `7D`, `30D`, `MTD`)
- Metric selector for Conversation Insights (Work Type, Intent Distribution, Categories, Task Complexity, Prompt Specificity)
- Cross-window coordination for High Cost Request Alerts so only one Cursor window polls usage and shows each alert

### Fixed

- High Cost Request Alerts could duplicate or race when multiple Cursor windows were open
- Activity Bar dashboard rendering issues for Conversation Insights

### Changed

- Updated Activity Bar screenshot to include Conversation Insights

# 1.1.0

### Changed

- Moved Cursor Insights from the Explorer sidebar into a dedicated **Cursor Insights** Activity Bar container with a Dashboard view
- Authentication now uses the local Cursor login (`state.vscdb` access token) instead of a manually pasted `WorkosCursorSessionToken`
- **Connect Account** re-checks the local Cursor login instead of prompting for a session token
- Removed **Reconnect Account** from the dashboard
- Read Cursor credentials via `node:sqlite` (with `sqlite3` CLI fallback) so multi-GB `state.vscdb` files work
- Status bar click opens the Cursor Insights Activity Bar and focuses the Dashboard
- Disconnected state shows a welcome screen with **Connect Account**

### Removed

- Manual session-token paste flow and Secret Storage for `WorkosCursorSessionToken`
- Cursor Insights contribution under the Explorer view

# 1.0.0

## Initial Public Release

### Added

- Month-to-date usage in the status bar
- Cursor Insights Explorer sidebar
- Monthly usage progress bar
- Recent Requests (last 3 requests)
- Configurable High Cost Request Alerts
- Ignore alerts for the current conversation
- One-click refresh
- Secure authentication using WorkosCursorSessionToken

## [0.0.3]

### Changed

- Renamed extension package and command IDs from `cursor-stats` to `cursor-insights`
- Removed development-only commands (`Dump Cookies`, `Test High Cost Alert`) from the Command Palette
- Added marketplace metadata: publisher, license, repository, keywords, and author

### Changed (from Unreleased)

- Renamed the extension display name from **Cursor Stats** to **Cursor Insights**
- Moved the status bar item to the left (near the Git branch)
- Status bar shows `MTD - $used / $limit`; details remain in the tooltip
- Clicking the status bar opens the Cursor Insights sidebar and refreshes usage
- Sidebar UI refined to a minimal native VS Code layout (no emojis or placeholders)

### Added

- Cursor Insights Explorer sidebar (webview) with monthly usage dashboard
- Progress bar and percentage for monthly usage
- Inline ⟳ refresh action on the Monthly Usage header
- Quick actions: Open Cursor Usage Dashboard, Reconnect Account
- MIT `LICENSE` for marketplace publishing
