import * as vscode from 'vscode';
import * as path from 'path';

export class SettingsPanel implements vscode.WebviewPanelSerializer {
  public static readonly viewType = 'denix-ai.settingsPanel';
  private static readonly viewTitle = 'Denix AI Settings';
  private _panel: vscode.WebviewPanel | undefined;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext | undefined;
  private _updateInterval?: NodeJS.Timeout;
  private _fileWatcher?: vscode.FileSystemWatcher;

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

    const stats = await this._getWorkspaceStats();
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, stats);
    
    this._setupWatchers();

    this._panel.onDidDispose(() => {
      this._panel = undefined;
      if (this._updateInterval) clearInterval(this._updateInterval);
      if (this._fileWatcher) this._fileWatcher.dispose();
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

  private _setupWatchers() {
    if (!this._panel) return;
    if (this._fileWatcher) this._fileWatcher.dispose();
    if (this._updateInterval) clearInterval(this._updateInterval);

    this._fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    
    const updateStats = async () => {
      if (!this._panel) return;
      const stats = await this._getWorkspaceStats();
      this._panel.webview.postMessage({ type: 'updateStats', stats });
    };

    if (this._context) {
      const sub = vscode.commands.registerCommand('denix-ai.refreshSettingsStats', updateStats);
      this._context?.subscriptions.push(sub);
      this._panel.onDidDispose(() => {
        sub.dispose();
      });
    }

    this._fileWatcher.onDidCreate(updateStats);
    this._fileWatcher.onDidDelete(updateStats);

    this._updateInterval = setInterval(updateStats, 2000);
  }

  private async _getWorkspaceStats() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const projectName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : 'No Workspace';

    let threadsCount = 0;
    try {
      const count = await vscode.commands.executeCommand<number>('denix-ai.getThreadsCount');
      if (typeof count === 'number') {
        threadsCount = count;
      }
    } catch (e) {
      console.error('Error fetching threads count:', e);
    }

    let fileCount = 0;
    const extCounts: Record<string, number> = {};
    
    try {
      const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.vscode-test/**}');
      fileCount = files.length;

      for (const f of files) {
        const ext = path.extname(f.fsPath).toLowerCase();
        if (ext) {
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        }
      }
    } catch (e) {
      console.error('Error finding files:', e);
    }

    const langMap: Record<string, { name: string; color: string }> = {
      '.ts': { name: 'TypeScript', color: '#6e39c4' },
      '.tsx': { name: 'TypeScript', color: '#6e39c4' },
      '.js': { name: 'JavaScript', color: '#2563eb' },
      '.jsx': { name: 'JavaScript', color: '#2563eb' },
      '.css': { name: 'CSS', color: '#0d9488' },
      '.html': { name: 'HTML', color: '#e34c26' },
      '.json': { name: 'JSON', color: '#854a00' },
      '.md': { name: 'Markdown', color: '#8b949e' },
      '.py': { name: 'Python', color: '#3572A5' },
      '.go': { name: 'Go', color: '#00ADD8' },
      '.rs': { name: 'Rust', color: '#dea584' },
      '.java': { name: 'Java', color: '#b07219' },
      '.c': { name: 'C', color: '#555555' },
      '.cpp': { name: 'C++', color: '#f34b7d' },
      '.cs': { name: 'C#', color: '#178600' },
      '.rb': { name: 'Ruby', color: '#701516' },
      '.php': { name: 'PHP', color: '#4F5D95' },
      '.vue': { name: 'Vue', color: '#41b883' }
    };

    const groupedStats: Record<string, { count: number; info: { name: string; color: string } }> = {};
    
    for (const [ext, count] of Object.entries(extCounts)) {
      const info = langMap[ext] || { name: 'Other', color: '#6e7681' };
      if (!groupedStats[info.name]) {
        groupedStats[info.name] = { count: 0, info };
      }
      groupedStats[info.name].count += count;
    }

    const totalTrackedFiles = Object.values(groupedStats).reduce((acc, curr) => acc + curr.count, 0);
    
    let languages = Object.values(groupedStats)
      .map(g => ({
        name: g.info.name,
        count: g.count,
        percentage: totalTrackedFiles > 0 ? (g.count / totalTrackedFiles) * 100 : 0,
        color: g.info.color
      }))
      .sort((a, b) => b.percentage - a.percentage);

    if (languages.length > 3) {
      const top3 = languages.slice(0, 3);
      const otherCount = languages.slice(3).reduce((acc, curr) => acc + curr.count, 0);
      top3.push({
        name: 'Other',
        count: otherCount,
        percentage: totalTrackedFiles > 0 ? (otherCount / totalTrackedFiles) * 100 : 0,
        color: '#6e7681'
      });
      languages = top3;
    }

    if (languages.length === 0) {
      languages = [
        { name: 'None', count: 0, percentage: 0, color: '#2c303b' }
      ];
    }

    return {
      projectName,
      files: fileCount,
      threads: threadsCount,
      languages
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview, stats: any): string {
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
          Home
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-category">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V7a4 4 0 0 1 8 0v4"></path><path d="M6 11h12"></path><path d="M12 11v10"></path><path d="M12 21h.01"></path><path d="M7.5 15h9"></path></svg>
          Integrations
        </div>
        <div class="nav-item sub-item" data-section="services">Services</div>
        <div class="nav-item sub-item" data-section="mcp">MCP Servers</div>
      </div>

      <div class="nav-group">
        <div class="nav-category">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          Account
        </div>
      </div>

      <div class="help-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </div>
    </nav>

    <main class="content">
      <section id="home" class="content-section active">
        
        <!-- Stunning Hero Banner -->
        <div class="hero-banner">
          <div class="hero-content">
            <div class="breadcrumb">Project Environment</div>
            <h1 class="project-title">${stats.projectName}</h1>
            <p class="hero-subtitle">Your AI is ready to assist. Customize your workspace and rules.</p>
          </div>
          <div class="hero-stats">
            <div class="stat-box glass">
              <div class="stat-top">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                Files
              </div>
              <div class="stat-value">${stats.files}</div>
            </div>
            <div class="stat-box glass">
              <div class="stat-top">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                Threads
              </div>
              <div class="stat-value">${stats.threads}</div>
            </div>
          </div>
        </div>

        <!-- Quick Actions Grid -->
        <h2 class="section-title">Quick Actions</h2>
        <div class="quick-actions-grid">
          <div class="action-card" onclick="vscode.postMessage({ type: 'command', command: 'denix-ai.askQuestion' })">
            <div class="action-icon quick-ask">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div class="action-info">
              <h3>New Chat</h3>
              <p>Start a new conversation</p>
            </div>
          </div>
          <div class="action-card" onclick="document.querySelector('[data-section=\\'rules\\']').click()">
            <div class="action-icon rules">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div class="action-info">
              <h3>Edit Rules</h3>
              <p>Customize AI behavior</p>
            </div>
          </div>
          <div class="action-card" onclick="document.querySelector('[data-section=\\'context\\']').click()">
            <div class="action-icon context">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            </div>
            <div class="action-info">
              <h3>Context</h3>
              <p>Manage workspace memory</p>
            </div>
          </div>
        </div>

        <div class="codebase-section">
          <h2 class="section-title">Codebase Analytics</h2>
          <div class="codebase-card glass-panel">
            <div class="card-title">Language Distribution</div>
            <div class="progress-bar">
              ${stats.languages.map((l: any) => `<div class="segment" style="width: ${l.percentage}%; background-color: ${l.color}; border-right: 2px solid var(--bg-card);"></div>`).join('')}
            </div>
            <div class="legend">
              ${stats.languages.map((l: any) => `<div class="legend-item" style="background: ${l.color}33; color: ${l.color};">${l.name} ${l.percentage.toFixed(1)}%</div>`).join('')}
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

    const stats = await this._getWorkspaceStats();
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, stats);
    
    this._setupWatchers();

    this._panel.onDidDispose(() => {
      this._panel = undefined;
      if (this._updateInterval) clearInterval(this._updateInterval);
      if (this._fileWatcher) this._fileWatcher.dispose();
    });

    this._panel.webview.onDidReceiveMessage(async (message) => {
      await this._handleMessage(message);
    });
  }
}
