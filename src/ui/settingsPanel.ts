import * as vscode from 'vscode';
import { RulesManager, RuleFile } from '../features/rules';
import { GuidelinesManager } from '../features/guidelines';

export class SettingsPanel {
  public static readonly viewType = 'denix-ai-settings';
  private panel: vscode.WebviewPanel | null = null;
  private rulesManager: RulesManager;
  private guidelinesManager: GuidelinesManager;

  constructor(
    private readonly extensionUri: vscode.Uri,
    rulesManager: RulesManager,
    guidelinesManager: GuidelinesManager
  ) {
    this.rulesManager = rulesManager;
    this.guidelinesManager = guidelinesManager;
  }

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

    this.panel.webview.html = await this.getHtml();
    this.panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    // Load initial data
    await this.refreshRules();
    await this.loadGuidelines();
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'refreshRules':
        await this.refreshRules();
        break;
      case 'createRule':
        await this.createRule();
        break;
      case 'openRule':
        await this.openRule(message.name);
        break;
      case 'deleteRule':
        await this.deleteRule(message.name);
        break;
      case 'saveGuidelines':
        await this.saveGuidelines(message.text);
        break;
      case 'loadGuidelines':
        await this.loadGuidelines();
        break;
      case 'importRules':
        await this.importRules();
        break;
    }
  }

  private async refreshRules(): Promise<void> {
    const rules = await this.rulesManager.listRuleFiles();
    this.panel?.webview.postMessage({ type: 'rulesUpdated', data: rules });
  }

  private async createRule(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter rule file name',
      placeHolder: 'e.g., typescript-style'
    });

    if (!name) return;

    try {
      const rule = await this.rulesManager.createRuleFile(name, `# ${name}\n\n`);
      await this.rulesManager.openRuleFile(rule);
      await this.refreshRules();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create rule: ${error.message}`);
    }
  }

  private async openRule(name: string): Promise<void> {
    const rules = await this.rulesManager.listRuleFiles();
    const rule = rules.find(r => r.name === name);
    if (rule) {
      await this.rulesManager.openRuleFile(rule);
    }
  }

  private async deleteRule(name: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete rule "${name}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      try {
        await this.rulesManager.deleteRuleFile(name);
        await this.refreshRules();
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to delete rule: ${error.message}`);
      }
    }
  }

  private async importRules(): Promise<void> {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Import',
      filters: {
        'Markdown files': ['md']
      }
    });

    if (!files || files.length === 0) return;

    try {
      for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        const fileName = file.path.split('/').pop() || 'imported-rule.md';
        await this.rulesManager.createRuleFile(fileName.replace('.md', ''), content.toString());
      }
      await this.refreshRules();
      vscode.window.showInformationMessage(`Imported ${files.length} rule file(s)`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to import rules: ${error.message}`);
    }
  }

  private async saveGuidelines(text: string): Promise<void> {
    try {
      await this.guidelinesManager.saveGuidelines(text);
      this.panel?.webview.postMessage({ type: 'guidelinesSaved' });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save guidelines: ${error.message}`);
    }
  }

  private async loadGuidelines(): Promise<void> {
    const guidelines = await this.guidelinesManager.loadGuidelines();
    this.panel?.webview.postMessage({ type: 'guidelinesLoaded', data: guidelines });
  }

  private async getHtml(): Promise<string> {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workspace Settings</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      height: 100vh;
      overflow: hidden;
      display: flex;
    }

    .settings-container {
      display: flex;
      width: 100%;
      height: 100vh;
    }

    .sidebar {
      width: 240px;
      background: #161b22;
      border-right: 1px solid #30363d;
      padding: 16px 0;
      overflow-y: auto;
    }

    .sidebar-title {
      padding: 0 16px 12px;
      font-size: 13px;
      font-weight: 600;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      color: #8b949e;
      text-decoration: none;
      font-size: 13px;
      transition: all 0.15s ease;
      cursor: pointer;
      border-left: 2px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #e6edf3;
    }

    .nav-item.active {
      background: rgba(31, 111, 235, 0.15);
      color: #58a6ff;
      border-left-color: #1f6feb;
    }

    .nav-item svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 40px;
      background: #0d1117;
    }

    h2 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 24px;
      color: #e6edf3;
    }

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #e6edf3;
    }

    .description {
      color: #8b949e;
      margin-bottom: 16px;
      line-height: 1.6;
      font-size: 13px;
    }

    .description a {
      color: #58a6ff;
      text-decoration: none;
    }

    .description a:hover {
      text-decoration: underline;
    }

    .rules-area {
      margin-bottom: 48px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .refresh-btn {
      background: transparent;
      border: 1px solid #30363d;
      color: #8b949e;
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      width: 28px;
      height: 28px;
    }

    .refresh-btn:hover {
      background: #21262d;
      border-color: #30363d;
      color: #e6edf3;
    }

    .refresh-btn svg {
      width: 14px;
      height: 14px;
    }

    .rules-list {
      margin: 16px 0;
      min-height: 60px;
    }

    .empty-state {
      color: #8b949e;
      text-align: center;
      padding: 24px;
      font-size: 13px;
    }

    .rule-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      margin-bottom: 8px;
      transition: all 0.15s ease;
    }

    .rule-item:hover {
      background: #21262d;
      border-color: #30363d;
    }

    .rule-name {
      font-weight: 500;
      font-size: 13px;
      color: #e6edf3;
    }

    .rule-actions {
      display: flex;
      gap: 8px;
    }

    .btn-icon {
      background: transparent;
      border: none;
      color: #8b949e;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .btn-icon:hover {
      background: #30363d;
      color: #e6edf3;
    }

    .btn-icon svg {
      width: 16px;
      height: 16px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .btn-primary, .btn-secondary {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid #30363d;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      background: #21262d;
      color: #e6edf3;
    }

    .btn-primary {
      background: #1f6feb;
      color: white;
      border-color: #1f6feb;
    }

    .btn-primary:hover {
      background: #2563eb;
      border-color: #2563eb;
    }

    .btn-secondary {
      position: relative;
    }

    .btn-secondary:hover {
      background: #30363d;
      border-color: #30363d;
    }

    .btn-secondary svg {
      width: 14px;
      height: 14px;
    }

    .guidelines-area {
      margin-top: 48px;
    }

    #guidelines-text {
      width: 100%;
      min-height: 200px;
      padding: 12px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.6;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s ease;
    }

    #guidelines-text:focus {
      border-color: #1f6feb;
    }

    #guidelines-text::placeholder {
      color: #6e7681;
    }

    .char-counter {
      text-align: right;
      color: #8b949e;
      font-size: 12px;
      margin-top: 8px;
    }

    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #21262d;
      border: 1px solid #30363d;
      padding: 12px 20px;
      border-radius: 6px;
      color: #e6edf3;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
      z-index: 1000;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div class="settings-container">
    <aside class="sidebar">
      <div class="sidebar-title">Workspace Settings</div>
      <nav>
        <a href="#tools" class="nav-item" data-section="tools">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.636 3.636l2.828 2.828M9.536 9.536l2.828 2.828M3.636 12.364l2.828-2.828M9.536 6.464l2.828-2.828"/>
          </svg>
          <span>Tools</span>
        </a>
        <a href="#rules" class="nav-item active" data-section="rules">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 4h9l3 3v13H6z"/>
            <path d="M15 4v3h3"/>
            <path d="M9 10h6M9 14h4"/>
          </svg>
          <span>Rules and User Guidelines</span>
        </a>
        <a href="#context" class="nav-item" data-section="context">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 5L8 2L14 5L14 11L8 14L2 11Z"/>
            <path d="M8 2V14M2 5L8 8L14 5M2 11L8 8L14 11"/>
          </svg>
          <span>Context</span>
        </a>
        <a href="#account" class="nav-item" data-section="account">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
            <path d="M13.5 14.5c0-3-2.5-5.5-5.5-5.5S2.5 11.5 2.5 14.5"/>
          </svg>
          <span>Account</span>
        </a>
        <a href="#secrets" class="nav-item" data-section="secrets">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="8" width="10" height="6" rx="1"/>
            <path d="M5 8V5a3 3 0 0 1 6 0v3"/>
            <circle cx="8" cy="11" r="1" fill="currentColor"/>
          </svg>
          <span>Secret Manager</span>
        </a>
      </nav>
    </aside>
    
    <main class="content">
      <section id="rules" class="rules-section">
        <h2>Rules and User Guidelines</h2>
        
        <div class="rules-area">
          <div class="section-header">
            <h3>Rules</h3>
            <button class="refresh-btn" id="refresh-rules" title="Refresh rules">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1.5 8a6.5 6.5 0 0 1 13 0"/>
                <path d="M14.5 8a6.5 6.5 0 0 1-13 0"/>
                <path d="M5 3l3 3-3 3M11 13l-3-3 3-3"/>
              </svg>
            </button>
          </div>
          <p class="description">Rules are instructions for Augment Chat and Agent that can be applied automatically across all conversations or referenced in specific conversations using @mentions (e.g., @rule-file.md) <a href="#">Learn more</a></p>
          
          <div id="rules-list" class="rules-list">
            <div class="empty-state">No rules files found</div>
          </div>
          
          <div class="actions">
            <button class="btn-primary" id="create-rule">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span>Create new rule file</span>
            </button>
            <button class="btn-secondary" id="import-rules">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v10M5 7l3-3 3 3M2 12h12"/>
              </svg>
              <span>Import rules</span>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px; margin-left: 2px;">
                <path d="M4 6l4 4 4-4"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="guidelines-area">
          <h3>User Guidelines</h3>
          <p class="description">User Guidelines allow you to control Augment's behavior through natural language instructions. These guidelines are applied globally to all Chat and Agent interactions. <a href="#">Learn more</a></p>
          <textarea id="guidelines-text" placeholder="Add your guidelines for Augment Chat..." spellcheck="false"></textarea>
          <div class="char-counter"><span id="char-count">0</span> characters</div>
        </div>
      </section>
    </main>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let rules = [];
    
    document.getElementById('refresh-rules').addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshRules' });
    });
    
    document.getElementById('create-rule').addEventListener('click', () => {
      vscode.postMessage({ command: 'createRule' });
    });
    
    document.getElementById('import-rules').addEventListener('click', () => {
      vscode.postMessage({ command: 'importRules' });
    });
    
    const guidelinesText = document.getElementById('guidelines-text');
    guidelinesText.addEventListener('input', (e) => {
      document.getElementById('char-count').textContent = e.target.value.length;
    });
    
    guidelinesText.addEventListener('blur', (e) => {
      vscode.postMessage({ command: 'saveGuidelines', text: e.target.value });
    });
    
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'rulesUpdated':
          rules = message.data;
          renderRules();
          break;
        case 'guidelinesLoaded':
          guidelinesText.value = message.data || '';
          document.getElementById('char-count').textContent = (message.data || '').length;
          break;
        case 'guidelinesSaved':
          showToast('Guidelines saved');
          break;
      }
    });
    
    function renderRules() {
      const container = document.getElementById('rules-list');
      if (rules.length === 0) {
        container.innerHTML = '<div class="empty-state">No rules files found</div>';
        return;
      }
      
      container.innerHTML = rules.map(rule => \`
        <div class="rule-item">
          <span class="rule-name">\${escapeHtml(rule.name)}</span>
          <div class="rule-actions">
            <button class="btn-icon" onclick="openRule('\${escapeHtml(rule.name)}')" title="Open rule">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 4h9l3 3v13H6z"/>
                <path d="M15 4v3h3"/>
                <path d="M9 10h6M9 14h4"/>
              </svg>
            </button>
            <button class="btn-icon" onclick="deleteRule('\${escapeHtml(rule.name)}')" title="Delete rule">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4l8 8M12 4l-8 8"/>
              </svg>
            </button>
          </div>
        </div>
      \`).join('');
    }
    
    function openRule(name) {
      vscode.postMessage({ command: 'openRule', name });
    }
    
    function deleteRule(name) {
      vscode.postMessage({ command: 'deleteRule', name });
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
    
    // Load initial data
    vscode.postMessage({ command: 'loadGuidelines' });
    vscode.postMessage({ command: 'refreshRules' });
  </script>
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
