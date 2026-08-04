# Cursor Insights

Display your Cursor monthly usage in the status bar and a dedicated Explorer sidebar.

## Features

- Status bar shows month-to-date usage (`MTD - $19.04 / $200.00`)
- Explorer sidebar dashboard with progress bar and quick actions
- Auto refresh every 60 seconds
- Securely stores your WorkosCursorSessionToken using VS Code Secret Storage
- Click the status bar to open Cursor Insights and refresh

## Install and Setup (Step by Step)

Follow these steps in order.

### 1) Download the `.vsix` from GitHub

1. Open this repository's **Releases** page on GitHub.
2. Download the latest `.vsix` asset (example: `cursor-insights-0.0.1.vsix`).

### 2) Install the `.vsix` in Cursor

1. Open the Cursor app.
2. Open Command Palette:
   - **Mac:** `Cmd + Shift + P`
   - **Windows:** `Ctrl + Shift + P`
3. Type and select: **Extensions: Install from VSIX...**
4. Choose the `.vsix` file you downloaded.
5. Complete installation and reload Cursor if prompted.

### 3) Connect Cursor account in the extension

1. After install, run **Connect Cursor** when prompted (or run **Cursor Insights: Connect Account** from Command Palette).
2. Cursor will ask for your session token (`WorkosCursorSessionToken`).

### 4) Get `WorkosCursorSessionToken` from Cursor Dashboard

1. Open the Cursor Dashboard in your browser and sign in.
2. Open browser DevTools.
3. Go to: **Application** → **Cookies** → `cursor.com`
4. Find cookie: `WorkosCursorSessionToken`
5. Copy its value.

### 5) Paste token in Cursor

1. Go back to Cursor app.
2. Paste the copied `WorkosCursorSessionToken` into the prompt.
3. Done. Usage should appear in the status bar and in the **Cursor Insights** Explorer view.

## Status Bar

Example: `MTD - $19.04 / $200.00`

![Cursor Insights status bar showing month-to-date usage](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/status-bar.png)

Hover to view:

- Used / Limit / Remaining
- Billing cycle

Click to open the Cursor Insights sidebar and refresh.

## Sidebar

The **Cursor Insights** view in Explorer shows:

- Monthly usage with progress bar and inline refresh
- Open Cursor Usage Dashboard
- Reconnect Account

![Cursor Insights sidebar with monthly usage progress and actions](https://raw.githubusercontent.com/AjayReddy-18/cursor-insights/main/images/side-bar.png)

## Commands

- Cursor Insights: Connect Account
- Cursor Insights: Disconnect Account
- Cursor Insights: Refresh
- Cursor Insights: Open Sidebar
- Cursor Insights: Open Cursor Usage Dashboard
- Cursor Insights: Show Logs
