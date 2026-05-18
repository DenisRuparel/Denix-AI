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
      case 'command':
        if (message.command === 'newChat') {
          vscode.commands.executeCommand('denix-ai.newThread');
          vscode.commands.executeCommand('denix-ai-chat.focus');
        } else if (message.command) {
          vscode.commands.executeCommand(message.command);
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

    // Fetch active configuration values to pre-populate form elements
    const config = vscode.workspace.getConfiguration('denix-ai');
    const openRouterApiKey = config.get<string>('openRouterApiKey', '');
    const model = config.get<string>('model', 'anthropic/claude-3.5-sonnet');
    const maxTokens = config.get<number>('maxTokens', 500);

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

    <div class="settings-content" style="flex: 1; padding: 48px; overflow-y: auto;">
      <main class="content" style="padding: 0; background: transparent; overflow: visible;">
        <!-- HOME SECTION -->
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
            <div class="action-card" onclick="vscode.postMessage({ type: 'command', command: 'newChat' })">
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
        </section>

        <!-- SERVICES SECTION -->
        <section id="services" class="content-section">
          <div class="section-hero">
            <h2>AI & Models</h2>
            <p>Configure credentials and active backends for your workspace assistant.</p>
          </div>
          
          <div class="settings-form">
            <div class="settings-card">
              <div class="card-header-flex">
                <h3>OpenRouter Configuration</h3>
              </div>
              <div class="form-group">
                <label class="form-label" for="openRouterApiKey">API Key</label>
                <div class="form-desc">Credentials are safely stored in your local VS Code workspace storage.</div>
                <input type="password" id="openRouterApiKey" class="form-control" value="${openRouterApiKey}" placeholder="Enter OpenRouter API Key (sk-or-v1-...)" />
              </div>
              
              <div class="form-group">
                <label class="form-label" for="model">Active AI Model</label>
                <div class="form-desc">Select the default LLM processor to handle chat prompt requests.</div>
                <select id="model" class="form-control">
                  <option value="anthropic/claude-3.5-sonnet" ${model === 'anthropic/claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet (Recommended)</option>
                  <option value="openai/gpt-4o" ${model === 'openai/gpt-4o' ? 'selected' : ''}>GPT-4o (High Speed)</option>
                  <option value="google/gemini-pro-1.5" ${model === 'google/gemini-pro-1.5' ? 'selected' : ''}>Gemini 1.5 Pro</option>
                  <option value="meta-llama/llama-3-70b-instruct" ${model === 'meta-llama/llama-3-70b-instruct' ? 'selected' : ''}>Llama 3 70B</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="maxTokens">Response Limit (Max Tokens)</label>
                <div class="form-desc">Cap output generation lengths to preserve token consumption rates.</div>
                <div class="slider-group">
                  <input type="range" id="maxTokens" min="100" max="4000" step="50" value="${maxTokens}" />
                  <span class="value-display">${maxTokens}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- RULES SECTION -->
        <section id="rules" class="content-section">
          <div class="section-hero">
            <h2>AI Rules & Instructions</h2>
            <p>Guide your AI's codebase analysis and output formatting style conventions.</p>
          </div>
          
          <div class="settings-form">
            <div class="settings-card">
              <div class="card-header-flex">
                <h3>Memory Management</h3>
              </div>
              <div class="form-group">
                <label class="form-label">Global Memories</label>
                <div class="form-desc">A persistent record of facts, preferences, and details the AI remembers across sessions.</div>
                <button class="btn btn-primary btn-block" onclick="vscode.postMessage({ type: 'command', command: 'denix-ai.openMemories' })">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                  Launch Memories Editor
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- CONTEXT SECTION -->
        <section id="context" class="content-section">
          <div class="section-hero">
            <h2>Context Management</h2>
            <p>Control files, text selections, and local indexes fed directly into prompts.</p>
          </div>
          
          <div class="settings-card">
            <div class="empty-section-msg">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              <h3>Workspace Indexing is Active</h3>
              <p>Active file syncing and C++ semantic scopes are tracked automatically.</p>
            </div>
          </div>
        </section>

        <!-- MCP SECTION -->
        <section id="mcp" class="content-section">
          <div class="section-hero">
            <h2>MCP Servers</h2>
            <p>Model Context Protocol services linked with active workspaces.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
              <h3>No MCP Servers configured</h3>
              <p>Connect model tools, databases, and filesystem modules here in a future update.</p>
            </div>
          </div>
        </section>

        <!-- SECRETS SECTION -->
        <section id="secrets" class="content-section">
          <div class="section-hero">
            <h2>Secret Manager</h2>
            <p>Private credentials and passwords safely isolated from repository pushes.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <h3>All Secrets Isolated</h3>
              <p>API keys and credentials are saved locally in securely-held environment keys.</p>
            </div>
          </div>
        </section>

        <!-- OTHER SECTIONS -->
        <section id="commands" class="content-section">
          <div class="section-hero">
            <h2>Custom Commands</h2>
            <p>Configure custom prompt workflows and trigger actions.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Custom Commands are Active</h3>
              <p>Run quick tasks and pre-compiled developer macros from the chat action panel.</p>
            </div>
          </div>
        </section>

        <section id="skills" class="content-section">
          <div class="section-hero">
            <h2>AI Skills</h2>
            <p>Enable or disable modular coding behaviors and analysis presets.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Autonomous Agents Enabled</h3>
              <p>Smart task processing, error debugging, and file edits are ready.</p>
            </div>
          </div>
        </section>

        <section id="hooks" class="content-section">
          <div class="section-hero">
            <h2>Git & File Hooks</h2>
            <p>Trigger AI scanning before commits or after local file changes.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Hooks Listening</h3>
              <p>Auto-scans active project file scopes automatically.</p>
            </div>
          </div>
        </section>

        <section id="terminal" class="content-section">
          <div class="section-hero">
            <h2>Terminal Operations</h2>
            <p>Manage autonomous bash run controls and terminal outputs.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Command Isolation Active</h3>
              <p>Terminal calls ask for developer review before direct execution.</p>
            </div>
          </div>
        </section>

        <section id="ux" class="content-section">
          <div class="section-hero">
            <h2>User Experience Settings</h2>
            <p>Customize animations, display elements, and active themes.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Theme Synced</h3>
              <p>Visual elements conform automatically to active VS Code templates.</p>
            </div>
          </div>
        </section>

        <section id="beta" class="content-section">
          <div class="section-hero">
            <h2>Beta Programs</h2>
            <p>Test cutting edge code synthesis models and sidebar interfaces.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>You are on the Latest Release</h3>
              <p>Enjoy elite model optimizations and fluid side panel tooltips.</p>
            </div>
          </div>
        </section>

        <section id="account" class="content-section">
          <div class="section-hero">
            <h2>Account Details</h2>
            <p>Manage subscription status, user settings, and developer profiles.</p>
          </div>
          <div class="settings-card">
            <div class="empty-section-msg">
              <h3>Profile Synchronized</h3>
              <p>Logged in successfully as <span style="color: #7a79ec; font-weight: 600;">denis.ruparel.inventyv@gmail.com</span>.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
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
