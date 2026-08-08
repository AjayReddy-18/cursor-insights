# Cursor Insights

Display your Cursor monthly usage directly inside Cursor, along with recent requests, conversation insights, and configurable high-cost request alerts.

## Install in Cursor

<a href="https://ajayreddy-18.github.io/cursor-insights/" target="_blank" rel="noopener noreferrer"><img alt="Install in Cursor" src="https://img.shields.io/badge/Install%20in-Cursor-111111?style=for-the-badge&logo=visualstudiocode&logoColor=white" /></a>

Click the button above to open a new tab that launches Cursor directly to the Cursor Insights extension.

### Quick install

1. Click **Install in Cursor**
2. Cursor opens to Cursor Insights
3. Click **Install**
4. Connect your account

## Features

- Status bar shows month-to-date usage (`MTD - $19.04 / $200.00`)
- Dedicated Activity Bar view with:
  - Monthly usage and progress bar
  - Recent Requests (last 3 requests with model and cost)
  - Conversation Insights chart with timeframe and metric controls
  - Configurable High Cost Alert threshold
  - Quick actions (Refresh, Open Usage Dashboard)
- Automatic monthly usage refresh every 60 seconds
- High Cost Request Alerts notify you whenever a single Cursor request exceeds your configured threshold
- Option to ignore alerts for the current conversation
- Uses your existing Cursor login on this machine (no token paste)
- Click the status bar to open Cursor Insights

## Manual install (VSIX)

Prefer offline installation? You can install from a `.vsix` instead.

### 1) Download the `.vsix` from GitHub

1. Open this repository's **Releases** page.
2. Download the latest `.vsix` asset (for example, `cursor-insights-1.2.0.vsix`).

### 2) Install the extension

1. Open Cursor.
2. Open the Command Palette:
   - **Mac:** `Cmd + Shift + P`
   - **Windows:** `Ctrl + Shift + P`
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix`.
5. Reload Cursor if prompted.

### 3) Sign in to Cursor

Cursor Insights reads the account already signed in on this machine.

1. Make sure you are signed in to Cursor (Cursor Settings → Account).
2. Open **Cursor Insights** from the Activity Bar (or run **Cursor Insights: Open Cursor Insights**).
3. If prompted, click **Connect Account**, then your monthly usage will appear in the status bar and dashboard.

No browser cookie or session token is required.

---

# Status Bar

Displays your month-to-date Cursor usage.

Example:

`MTD - $19.04 / $200.00`

![Cursor Insights status bar showing month-to-date usage](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/status-bar.png)

Clicking the status bar opens the Cursor Insights Activity Bar and focuses the Dashboard.

---

# Dashboard

The **Cursor Insights** Activity Bar dashboard includes:

- Monthly usage with progress bar
- Recent Requests (last 3 requests showing time, model and cost)
- Conversation Insights doughnut chart with timeframe (`1D`, `7D`, `30D`, `MTD`) and metric selection
- Configurable High Cost Alert threshold slider
- Refresh monthly usage and recent requests
- Open Cursor Usage Dashboard

![Cursor Insights Activity Bar showing monthly usage, recent requests, conversation insights and alert threshold](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/activity-bar.png)

---

# High Cost Request Alerts

Cursor Insights continuously monitors your latest Cursor requests.

If a single request costs more than your configured threshold, you'll receive a notification inside Cursor.

The threshold is fully configurable from the dashboard (default: **$2.00**).

For long-running or intentionally expensive chats, you can choose **Ignore this conversation** directly from the notification to suppress further alerts for the current conversation.

![High Cost Alert notification](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/usage-alert.png)

---

# Commands

- Cursor Insights: Connect Account
- Cursor Insights: Refresh
- Cursor Insights: Open Cursor Insights
- Cursor Insights: Open Cursor Usage Dashboard
- Cursor Insights: Show Logs

# Requirements

- Cursor must be signed in on this machine
- Network access to `cursor.com`
