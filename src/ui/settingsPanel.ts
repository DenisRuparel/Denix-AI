import * as vscode from 'vscode';

export class SettingsPanel {
  public static readonly viewType = 'denix-ai-settings';
  private panel: vscode.WebviewPanel | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      'Workspace Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  private getHtml(): string {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workspace Settings</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
    }
    .container {
      max-width: 680px;
      margin: 0 auto;
      padding: 48px 32px 64px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #8b949e;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
    }
    .card h2 {
      font-size: 18px;
      margin-bottom: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #8b949e;
      background: rgba(88, 166, 255, 0.1);
      border: 1px solid rgba(88, 166, 255, 0.3);
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M8 1.5L1.5 5v6L8 14.5l6.5-3.5v-6L8 1.5z" />
      </svg>
      Workspace tools
    </div>
    <h1>Workspace configuration</h1>
    <p>
      Rules and user guidelines management have been removed from the Denix chat panel.
      This page will be used in the future for streamlined workspace settings focused on
      automation, integrations, and guardrails.
    </p>

    <div class="card">
      <h2>Coming soon</h2>
      <p>
        Stay tuned for a refreshed workspace experience that centralizes model controls,
        tool permissions, and automation preferences in one place.
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

