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
var vscode3 = __toESM(require("vscode"));

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
function logJson(label, data) {
  log(label);
  getOutput().appendLine(JSON.stringify(data, null, 2));
}
function logError(message, error) {
  log(message);
  if (error instanceof Error) {
    getOutput().appendLine(error.stack ?? `${error.name}: ${error.message}`);
    return;
  }
  getOutput().appendLine(String(error));
}

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
var vscode2 = __toESM(require("vscode"));

// src/api/client.ts
var USAGE_SUMMARY_URL = "https://cursor.com/api/usage-summary";
function headersToObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
async function testApiConnection() {
  log(`API request started: GET ${USAGE_SUMMARY_URL}`);
  try {
    const response = await fetch(USAGE_SUMMARY_URL, {
      credentials: "include"
    });
    log(`Response status: ${response.status} ${response.statusText}`);
    logJson("Response headers:", headersToObject(response.headers));
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const data = await response.json();
    logJson("Success JSON:", data);
    return data;
  } catch (error) {
    logError("API request failed:", error);
    throw error;
  }
}

// src/statusBar.ts
var REFRESH_COMMAND = "cursor-stats.refresh";
var LOADING_TEXT = "\u26A1 Cursor Usage: Loading...";
var REFRESHING_TEXT = "$(sync~spin) Refreshing...";
var CursorStatsStatusBar = class {
  statusBarItem;
  constructor() {
    this.statusBarItem = vscode2.window.createStatusBarItem(
      vscode2.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.text = LOADING_TEXT;
    this.statusBarItem.tooltip = "Refresh Cursor usage";
    this.statusBarItem.command = REFRESH_COMMAND;
    this.statusBarItem.show();
  }
  async refresh() {
    log("Refresh command started");
    this.statusBarItem.text = REFRESHING_TEXT;
    try {
      await testApiConnection();
      this.statusBarItem.text = "\u2705 Connected";
    } catch (error) {
      const status = error instanceof Error ? error.message : "Error";
      this.statusBarItem.text = `\u274C ${status}`;
    }
  }
  dispose() {
    this.statusBarItem.dispose();
  }
};

// src/extension.ts
function activate(context) {
  initLogger(context);
  log("Extension activated");
  showLogs();
  const statusBar = new CursorStatsStatusBar();
  const refreshCommand = vscode3.commands.registerCommand(
    REFRESH_COMMAND,
    () => statusBar.refresh()
  );
  const dumpCookiesCommand = vscode3.commands.registerCommand(
    "cursor-stats.dumpCookies",
    () => dumpCookies()
  );
  const showLogsCommand = vscode3.commands.registerCommand(
    "cursor-stats.showLogs",
    () => showLogs()
  );
  context.subscriptions.push(
    statusBar,
    refreshCommand,
    dumpCookiesCommand,
    showLogsCommand
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
