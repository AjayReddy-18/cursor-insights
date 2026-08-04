# Change Log

All notable changes to the "Cursor Insights" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Changed

- Renamed the extension from **Cursor Stats** to **Cursor Insights**
- Moved the status bar item to the left (near the Git branch)
- Status bar shows `MTD - $used / $limit`; details remain in the tooltip
- Clicking the status bar opens the Cursor Insights sidebar and refreshes usage
- Sidebar UI refined to a minimal native VS Code layout (no emojis or placeholders)

### Added

- Cursor Insights Explorer sidebar (webview) with monthly usage dashboard
- Progress bar and percentage for monthly usage
- Inline ⟳ refresh action on the Monthly Usage header
- Quick actions: Open Cursor Usage Dashboard, Reconnect Account
