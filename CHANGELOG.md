# Change Log

All notable changes to the "Cursor Insights" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
