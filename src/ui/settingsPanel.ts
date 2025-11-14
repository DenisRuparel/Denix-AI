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
      'Denix Settings',
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
      // Implementation would delete file
      await this.refreshRules();
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
    const styleUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'ui', 'settings.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Denix Settings</title>
  <link href="${styleUri}" rel="stylesheet" />
</head>
<body>
  <div class="settings-container">
    <aside class="sidebar">
      <nav>
        <a href="#workspace" class="nav-item">🔧 Workspace Settings</a>
        <a href="#tools" class="nav-item">🛠️ Tools</a>
        <a href="#rules" class="nav-item active">📋 Rules and User Guidelines</a>
        <a href="#context" class="nav-item">📁 Context</a>
        <a href="#account" class="nav-item">👤 Account</a>
        <a href="#secrets" class="nav-item">🔐 Secret Manager</a>
      </nav>
    </aside>
    
    <main class="content">
      <section id="rules" class="rules-section">
        <h2>Rules and User Guidelines</h2>
        
        <div class="rules-area">
          <div class="section-header">
            <h3>Rules</h3>
            <button class="refresh-btn" id="refresh-rules">🔄</button>
          </div>
          <p class="description">Rules are instructions for Denix Chat and Agent that can be applied automatically across all conversations or referenced in specific conversations using @mentions (e.g., @rule-file.md)</p>
          
          <div id="rules-list" class="rules-list">
            <div class="empty-state">No rules files found</div>
          </div>
          
          <div class="actions">
            <button class="btn-primary" id="create-rule">+ Create new rule file</button>
            <button class="btn-secondary" id="import-rules">⬇️ Import rules ▼</button>
          </div>
        </div>
        
        <div class="guidelines-area">
          <h3>User Guidelines</h3>
          <p class="description">User Guidelines allow you to control Denix's behavior through natural language instructions. These guidelines are applied globally to all Chat and Agent interactions.</p>
          <textarea id="guidelines-text" placeholder="Add your guidelines for Denix Chat..."></textarea>
          <div class="char-counter"><span id="char-count">0</span> characters</div>
        </div>
      </section>
    </main>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    let rules = [];
    
    document.getElementById('refresh-rules').addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshRules' });
    });
    
    document.getElementById('create-rule').addEventListener('click', () => {
      vscode.postMessage({ command: 'createRule' });
    });
    
    document.getElementById('guidelines-text').addEventListener('input', (e) => {
      document.getElementById('char-count').textContent = e.target.value.length;
    });
    
    document.getElementById('guidelines-text').addEventListener('blur', (e) => {
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
          document.getElementById('guidelines-text').value = message.data || '';
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
          <span class="rule-name">\${rule.name}</span>
          <div class="rule-actions">
            <button class="btn-icon" onclick="openRule('\${rule.name}')">📝</button>
            <button class="btn-icon" onclick="deleteRule('\${rule.name}')">🗑️</button>
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
    
    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
    
    vscode.postMessage({ command: 'loadGuidelines' });
    vscode.postMessage({ command: 'refreshRules' });
  </script>
</body>
</html>`;
  }
}
