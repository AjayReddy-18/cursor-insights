# Cursor Insights

Display your Cursor monthly usage in the status bar and a dedicated Explorer sidebar.

## Features

- Status bar shows month-to-date usage (`MTD - $19.04 / $200.00`)
- Explorer sidebar dashboard with progress bar and quick actions
- Auto refresh every 60 seconds
- Securely stores your WorkosCursorSessionToken using VS Code Secret Storage
- Click the status bar to open Cursor Insights and refresh

## Installing from GitHub Releases

1. Open this repository's **Releases** page on GitHub and download the latest `.vsix` asset (for example `cursor-insights-0.0.1.vsix`).
2. In VS Code or Cursor, open the Command Palette and run **Extensions: Install from VSIX...** (or use **Extensions → Install from VSIX...**).
3. Select the downloaded `.vsix` file and confirm the install.
4. Reload the window if prompted.

## Setup

1. Install the extension (see above, or install from a local `.vsix`).
2. Click **Connect Cursor** in the status bar (or use **Cursor Insights: Connect Account**).
3. Paste your WorkosCursorSessionToken.
4. Usage appears in the status bar and the **Cursor Insights** Explorer view.

## Status Bar

Example:

MTD - $19.04 / $200.00

Hover to view:

- Used / Limit / Remaining
- Billing cycle

Click to open the Cursor Insights sidebar and refresh.

## Sidebar

The **Cursor Insights** view in Explorer shows:

- Monthly usage with progress bar and inline refresh
- Open Cursor Usage Dashboard
- Reconnect Account

## Commands

- Cursor Insights: Connect Account
- Cursor Insights: Disconnect Account
- Cursor Insights: Refresh
- Cursor Insights: Open Sidebar
- Cursor Insights: Open Cursor Usage Dashboard
- Cursor Insights: Show Logs
