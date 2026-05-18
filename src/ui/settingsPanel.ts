import * as vscode from 'vscode';
import * as path from 'path';

export class SettingsPanel implements vscode.WebviewPanelSerializer {
  public static readonly viewType = 'denix-ai.settingsPanel';
  private static readonly viewTitle = 'Denix AI Settings';
  private _panel: vscode.WebviewPanel | undefined;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this._context = context;
  }

  public async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      SettingsPanel.viewTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'media'),
          vscode.Uri.joinPath(this._extensionUri, 'dist'),
          vscode.Uri.joinPath(this._extensionUri, 'src')
        ]
      }
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    this._panel.webview.onDidReceiveMessage(async (message) => {
      await this._handleMessage(message);
    });
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'saveSetting':
        if (this._context) {
          await vscode.workspace.getConfiguration('denix-ai').update(
            message.key,
            message.value,
            message.scope === 'global' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace
          );
        }
        break;
      case 'getSetting':
        const value = vscode.workspace.getConfiguration('denix-ai').get(message.key);
        this._panel?.webview.postMessage({
          type: 'settingValue',
          key: message.key,
          value: value
        });
        break;
      case 'openLink':
        if (message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'settings.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'settings.js')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Settings</title>
</head>
<body>
  <div class="settings-container">
    <nav class="sidebar">
      <div class="nav-group">
        <div class="nav-item active" data-section="home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
          Home
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-category">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Integrations
        </div>
        <div class="nav-item sub-item" data-section="services">Services</div>
        <div class="nav-item sub-item" data-section="mcp">MCP Servers</div>
      </div>

      <div class="nav-group">
        <div class="nav-category">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          Preferences
        </div>
        <div class="nav-item sub-item" data-section="rules">Rules & Guidelines</div>
        <div class="nav-item sub-item" data-section="secrets">Secret Manager</div>
        <div class="nav-item sub-item" data-section="commands">
          Commands <span class="beta-badge">Beta</span>
        </div>
        <div class="nav-item sub-item" data-section="skills">
          Skills <span class="beta-badge">Beta</span>
        </div>
        <div class="nav-item sub-item" data-section="hooks">Hooks</div>
      </div>

      <div class="nav-group">
        <div class="nav-category">
          <span class="icon-text">&lt; &gt;</span>
          IDE & Workspace
        </div>
        <div class="nav-item sub-item" data-section="context">Context</div>
        <div class="nav-item sub-item" data-section="terminal">Terminal</div>
        <div class="nav-item sub-item" data-section="ux">User Experience</div>
        <div class="nav-item sub-item" data-section="beta">Beta</div>
      </div>

      <div class="nav-group account-group">
        <div class="nav-item nav-category" data-section="account">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          Account
        </div>
      </div>

      <div class="help-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </div>
    </nav>

    <main class="content">
      <section id="home" class="content-section active">
        <div class="home-header">
          <div class="header-left">
            <div class="breadcrumb">Project Home</div>
            <h1 class="project-title">Denix AI</h1>
          </div>
          <div class="header-right">
            <div class="top-user-icon">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div class="stats-container">
              <div class="stat-box">
                <div class="stat-top">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  Files
                </div>
                <div class="stat-value">46</div>
              </div>
              <div class="stat-box">
                <div class="stat-top">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                  Threads
                </div>
                <div class="stat-value">1</div>
              </div>
            </div>
          </div>
        </div>

        <div class="codebase-section">
          <h2 class="section-title">Codebase</h2>
          <div class="codebase-card">
            <div class="card-title">Languages</div>
            <div class="progress-bar">
              <div class="segment ts" style="width: 44.5%"></div>
              <div class="segment js" style="width: 33.1%"></div>
              <div class="segment css" style="width: 22.4%"></div>
            </div>
            <div class="legend">
              <div class="legend-item ts">TypeScript 44.5%</div>
              <div class="legend-item js">JavaScript 33.1%</div>
              <div class="legend-item css">CSS 22.4%</div>
            </div>
          </div>
        </div>

        <div class="warning-msg">
          <span class="warning-icon">⚠️</span> You have run out of credits for <a href="mailto:denis.ruparel.inventyv@gmail.com">denis.ruparel.inventyv@gmail.com</a>. Please <a href="#">click here</a> to upgrade. <span class="warning-icon">⚠️</span>
        </div>
      </section>
    </main>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: any
  ): Promise<void> {
    this._panel = webviewPanel;
  }
}
