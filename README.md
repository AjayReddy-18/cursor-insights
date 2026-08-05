# Cursor Insights

Display your Cursor monthly usage directly inside Cursor, along with recent requests and configurable high-cost request alerts.

## Features

- Status bar shows month-to-date usage (`MTD - $19.04 / $200.00`)
- Explorer sidebar with:
  - Monthly usage and progress bar
  - Recent Requests (last 3 requests with model and cost)
  - Configurable High Cost Alert threshold
  - Quick actions (Refresh, Open Usage Dashboard, Reconnect Account)
- Automatic monthly usage refresh every 60 seconds
- High Cost Request Alerts notify you whenever a single Cursor request exceeds your configured threshold
- Option to ignore alerts for the current conversation
- Securely stores your `WorkosCursorSessionToken` using VS Code Secret Storage
- Click the status bar to open Cursor Insights

## Install and Setup (Step by Step)

Follow these steps in order.

### 1) Download the `.vsix` from GitHub

1. Open this repository's **Releases** page.
2. Download the latest `.vsix` asset (for example: `cursor-insights-0.1.0.vsix`).

### 2) Install the extension

1. Open Cursor.
2. Open the Command Palette:
   - **Mac:** `Cmd + Shift + P`
   - **Windows:** `Ctrl + Shift + P`
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix`.
5. Reload Cursor if prompted.

### 3) Connect your Cursor account

1. Run **Cursor Insights: Connect Account** (or click the prompt shown after installation).
2. Paste your `WorkosCursorSessionToken` when prompted.

### 4) Obtain `WorkosCursorSessionToken`

1. Open the Cursor Usage Dashboard in your browser and sign in.
2. Open Developer Tools.
3. Navigate to:

   **Application → Cookies → cursor.com**

4. Copy the value of:

   `WorkosCursorSessionToken`

### 5) Complete setup

1. Return to Cursor.
2. Paste the copied token.
3. Your monthly usage will now appear in both the status bar and the Cursor Insights sidebar.

---

# Status Bar

Displays your month-to-date Cursor usage.

Example:

`MTD - $19.04 / $200.00`

![Cursor Insights status bar showing month-to-date usage](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/status-bar.png)

Clicking the status bar opens the Cursor Insights sidebar.

---

# Sidebar

The **Cursor Insights** Explorer view includes:

- Monthly usage with progress bar
- Recent Requests (last 3 requests showing time, model and cost)
- Configurable High Cost Alert threshold slider
- Refresh monthly usage and recent requests
- Open Cursor Usage Dashboard
- Reconnect Account

![Cursor Insights sidebar showing monthly usage, recent requests and alert threshold](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/side-bar.png)

---

# High Cost Request Alerts

Cursor Insights continuously monitors your latest Cursor requests.

If a single request costs more than your configured threshold, you'll receive a notification inside Cursor.

The threshold is fully configurable from the sidebar (default: **$2.00**).

For long-running or intentionally expensive chats, you can choose **Ignore this conversation** directly from the notification to suppress further alerts for the current conversation.

![High Cost Alert notification](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/usage-alert.png)

---

# Commands

- Cursor Insights: Connect Account
- Cursor Insights: Disconnect Account
- Cursor Insights: Refresh
- Cursor Insights: Open Sidebar
- Cursor Insights: Open Cursor Usage Dashboard
- Cursor Insights: Show Logs
- Cursor Insights: Test High Cost Alert