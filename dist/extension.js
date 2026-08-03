"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode4 = __toESM(require("vscode"));

// src/auth/manualSessionProvider.ts
var vscode2 = __toESM(require("vscode"));

// src/logger.ts
var vscode = __toESM(require("vscode"));
var CHANNEL_NAME = "Cursor Stats";
var outputChannel;
function initLogger(context) {
  if (outputChannel) {
    return;
  }
  outputChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
}
function getOutput() {
  if (!outputChannel) {
    throw new Error("Logger not initialized. Call initLogger() during activation.");
  }
  return outputChannel;
}
function showLogs() {
  getOutput().show(true);
}
function timestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function log(message) {
  getOutput().appendLine(`[${timestamp()}] ${message}`);
}
function logError(message, error) {
  log(message);
  if (error instanceof Error) {
    getOutput().appendLine(error.stack ?? `${error.name}: ${error.message}`);
    return;
  }
  getOutput().appendLine(String(error));
}

// src/auth/manualSessionProvider.ts
var SECRET_KEY = "cursor-stats.workosCursorSessionToken";
var COOKIE_NAME = "WorkosCursorSessionToken";
var ManualSessionProvider = class {
  constructor(secrets) {
    this.secrets = secrets;
  }
  secrets;
  async isAuthenticated() {
    const token = await this.secrets.get(SECRET_KEY);
    return Boolean(token);
  }
  async getAuthHeaders() {
    const token = await this.secrets.get(SECRET_KEY);
    if (!token) {
      throw new Error("Not authenticated. Connect your Cursor account first.");
    }
    return {
      Cookie: `${COOKIE_NAME}=${token}`
    };
  }
  async connect() {
    log("Authentication started");
    try {
      const token = await vscode2.window.showInputBox({
        title: "Cursor Stats: Connect Account",
        prompt: "Paste your WorkosCursorSessionToken",
        placeHolder: "WorkosCursorSessionToken",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value.trim()) {
            return "Token cannot be empty";
          }
          return void 0;
        }
      });
      if (token === void 0) {
        log("Authentication cancelled");
        return false;
      }
      const trimmed = token.trim();
      await this.secrets.store(SECRET_KEY, trimmed);
      log("Authentication completed");
      return true;
    } catch (error) {
      logError("Authentication failed:", error);
      throw error;
    }
  }
  async disconnect() {
    await this.secrets.delete(SECRET_KEY);
    log("Account disconnected");
  }
};

// src/dumpCookies.ts
async function dumpCookies() {
  log("Dump cookies: started");
  let electron;
  try {
    electron = require("electron");
  } catch (error) {
    logError("Failed to import electron:", error);
    return;
  }
  try {
    const cookies = await electron.session.defaultSession.cookies.get({});
    log(`Dump cookies: found ${cookies.length} cookie(s)`);
    for (const cookie of cookies) {
      log(`name=${cookie.name}; domain=${cookie.domain ?? "(none)"}`);
    }
    log("Dump cookies: finished");
  } catch (error) {
    logError("Failed to read Electron cookies:", error);
  }
}

// src/statusBar.ts
var vscode3 = __toESM(require("vscode"));

// src/api/client.ts
var USAGE_SUMMARY_URL = "https://cursor.com/api/usage-summary";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function requireNumber(value, path) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid usage-summary response: ${path} must be a number`);
  }
  return value;
}
function requireDate(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid usage-summary response: ${path} must be a date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid usage-summary response: ${path} is not a valid date`);
  }
  return date;
}
async function fetchIndividualUsage(auth) {
  log(`API request started: GET ${USAGE_SUMMARY_URL}`);
  try {
    const authHeaders = await auth.getAuthHeaders();
    const response = await fetch(USAGE_SUMMARY_URL, {
      method: "GET",
      headers: {
        ...authHeaders
      }
    });
    log(`Response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return parseIndividualUsage(data);
  } catch (error) {
    logError("API request failed:", error);
    throw error;
  }
}
function parseIndividualUsage(data) {
  if (!isRecord(data)) {
    throw new Error("Invalid usage-summary response: expected an object");
  }
  const individualUsage = data.individualUsage;
  if (!isRecord(individualUsage)) {
    throw new Error("Invalid usage-summary response: missing individualUsage");
  }
  const overall = individualUsage.overall;
  if (!isRecord(overall)) {
    throw new Error("Invalid usage-summary response: missing individualUsage.overall");
  }
  return {
    usedCents: requireNumber(overall.used, "individualUsage.overall.used"),
    limitCents: requireNumber(overall.limit, "individualUsage.overall.limit"),
    remainingCents: requireNumber(overall.remaining, "individualUsage.overall.remaining"),
    billingCycleStart: requireDate(data.billingCycleStart, "billingCycleStart"),
    billingCycleEnd: requireDate(data.billingCycleEnd, "billingCycleEnd")
  };
}

// src/api/format.ts
function formatCentsAsUsd(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}
function formatBillingDay(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

// src/statusBar.ts
var CONNECT_COMMAND = "cursor-stats.connect";
var DISCONNECT_COMMAND = "cursor-stats.disconnect";
var REFRESH_COMMAND = "cursor-stats.refresh";
var DISCONNECTED_TEXT = "\u26A0 Connect Cursor";
var REFRESHING_TEXT = "$(sync~spin) Refreshing...";
var REFRESH_INTERVAL_MS = 6e4;
var CursorStatsStatusBar = class {
  constructor(auth) {
    this.auth = auth;
    this.statusBarItem = vscode3.window.createStatusBarItem(
      vscode3.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.show();
  }
  auth;
  statusBarItem;
  lastUsage;
  refreshTimer;
  refreshInFlight;
  async initialize() {
    if (await this.auth.isAuthenticated()) {
      await this.refresh();
      this.startAutoRefresh();
      return;
    }
    this.showDisconnected();
  }
  async connect() {
    const connected = await this.auth.connect();
    if (!connected) {
      this.showDisconnected();
      return;
    }
    await this.refresh();
    this.startAutoRefresh();
  }
  async disconnect() {
    this.stopAutoRefresh();
    this.lastUsage = void 0;
    await this.auth.disconnect();
    this.showDisconnected();
    void vscode3.window.showInformationMessage("Cursor Stats: Account disconnected");
  }
  async refresh() {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = void 0;
    });
    return this.refreshInFlight;
  }
  async doRefresh() {
    log("Refresh command started");
    if (!await this.auth.isAuthenticated()) {
      this.stopAutoRefresh();
      this.lastUsage = void 0;
      this.showDisconnected();
      void vscode3.window.showWarningMessage(
        "Cursor Stats: Not connected. Connect your account first."
      );
      return;
    }
    this.statusBarItem.text = REFRESHING_TEXT;
    this.statusBarItem.command = REFRESH_COMMAND;
    try {
      const usage = await fetchIndividualUsage(this.auth);
      this.lastUsage = usage;
      this.showUsage(usage);
      log(
        `Usage updated: ${formatCentsAsUsd(usage.usedCents)} / ${formatCentsAsUsd(usage.limitCents)}`
      );
    } catch (error) {
      logError("Refresh failed:", error);
      if (this.lastUsage) {
        this.showUsage(this.lastUsage);
        return;
      }
      this.statusBarItem.text = "\u26A1 Usage unavailable";
      this.statusBarItem.tooltip = "Failed to load usage \u2014 click to retry";
      this.statusBarItem.command = REFRESH_COMMAND;
    }
  }
  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
  }
  stopAutoRefresh() {
    if (this.refreshTimer !== void 0) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = void 0;
    }
  }
  showDisconnected() {
    this.statusBarItem.text = DISCONNECTED_TEXT;
    this.statusBarItem.tooltip = "Connect your Cursor account";
    this.statusBarItem.command = CONNECT_COMMAND;
  }
  showUsage(usage) {
    const used = formatCentsAsUsd(usage.usedCents);
    const limit = formatCentsAsUsd(usage.limitCents);
    const remaining = formatCentsAsUsd(usage.remainingCents);
    const cycleStart = formatBillingDay(usage.billingCycleStart);
    const cycleEnd = formatBillingDay(usage.billingCycleEnd);
    this.statusBarItem.text = `\u26A1 ${used} / ${limit}`;
    this.statusBarItem.tooltip = [
      "Cursor Stats",
      "",
      `Used: ${used}`,
      `Limit: ${limit}`,
      `Remaining: ${remaining}`,
      "",
      `Billing Cycle: ${cycleStart} \u2192 ${cycleEnd}`,
      "",
      "Click to refresh"
    ].join("\n");
    this.statusBarItem.command = REFRESH_COMMAND;
  }
  dispose() {
    this.stopAutoRefresh();
    this.statusBarItem.dispose();
  }
};

// src/extension.ts
function activate(context) {
  initLogger(context);
  log("Extension activated");
  showLogs();
  const auth = new ManualSessionProvider(context.secrets);
  const statusBar = new CursorStatsStatusBar(auth);
  context.subscriptions.push(
    statusBar,
    vscode4.commands.registerCommand(CONNECT_COMMAND, () => statusBar.connect()),
    vscode4.commands.registerCommand(DISCONNECT_COMMAND, () => statusBar.disconnect()),
    vscode4.commands.registerCommand(REFRESH_COMMAND, () => statusBar.refresh()),
    vscode4.commands.registerCommand("cursor-stats.dumpCookies", () => dumpCookies()),
    vscode4.commands.registerCommand("cursor-stats.showLogs", () => showLogs())
  );
  void statusBar.initialize();
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
