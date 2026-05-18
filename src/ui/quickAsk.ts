import * as vscode from 'vscode';
import { QuickQuestionTemplate } from '../features/askQuestion';

export class QuickAskPanel {
  private panel: vscode.WebviewPanel | null = null;
  private onSendCallback?: (prompt: string, templateId: string) => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    onSend: (prompt: string, templateId: string) => void
  ) {
    this.onSendCallback = onSend;
  }

  public show(templates: QuickQuestionTemplate[], context: string = ''): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.panel.webview.postMessage({ type: 'templates', data: templates, context });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'denix-ai-quick-ask',
      'Ask a Question',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false
      }
    );

    this.panel.webview.html = this.renderHtml(templates, context);
    this.panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'send') {
        this.onSendCallback?.(message.prompt, message.templateId || '');
        this.panel?.dispose();
      } else if (message.type === 'dispose') {
        this.panel?.dispose();
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  private renderHtml(templates: QuickQuestionTemplate[], context: string): string {
    const templatesHtml = templates.map(t => `
      <button class="template-btn" data-id="${t.id}">
        <div class="template-btn-content">
          <strong>${t.label}</strong>
          <span class="template-prompt">${t.prompt}</span>
        </div>
      </button>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ask a Question</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: var(--vscode-editor-background, #0d1117);
      color: var(--vscode-editor-foreground, #e6edf3);
      padding: 24px;
      line-height: 1.5;
    }
    h2 {
      margin-bottom: 20px;
      font-weight: 600;
      color: var(--vscode-editor-foreground, #e6edf3);
    }
    .context-preview {
      background: var(--vscode-sideBar-background, #161b22);
      border: 1px solid var(--vscode-sideBarSectionHeader-border, #30363d);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 20px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #8b949e);
      max-height: 120px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .context-preview strong {
      color: var(--vscode-editor-foreground, #e6edf3);
    }
    .templates {
      display: grid;
      gap: 12px;
      margin-bottom: 20px;
    }
    .template-btn {
      background: var(--vscode-sideBar-background, #161b22);
      border: 1px solid var(--vscode-sideBarSectionHeader-border, #30363d);
      border-radius: 8px;
      padding: 14px;
      color: var(--vscode-editor-foreground, #e6edf3);
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
      width: 100%;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }
    .template-btn:hover {
      background: var(--vscode-list-hoverBackground, #21262d);
      border-color: var(--vscode-focusBorder, #1f6feb);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .template-btn:active {
      transform: translateY(0);
    }
    .template-btn strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
      color: var(--vscode-editor-foreground, #e6edf3);
    }
    .template-prompt {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #8b949e);
    }
    #custom-prompt {
      width: 100%;
      min-height: 100px;
      padding: 14px;
      background: var(--vscode-input-background, #161b22);
      border: 1px solid var(--vscode-input-border, #30363d);
      border-radius: 8px;
      color: var(--vscode-input-foreground, #e6edf3);
      font-family: inherit;
      font-size: 14px;
      margin-bottom: 16px;
      resize: vertical;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    #custom-prompt:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, #1f6feb);
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: var(--vscode-button-background, #1f6feb);
      color: var(--vscode-button-foreground, white);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground, #388bfd);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #21262d);
      color: var(--vscode-button-secondaryForeground, #e6edf3);
      border: 1px solid var(--vscode-button-secondaryBorder, #30363d);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, #30363d);
    }
  </style>
</head>
<body>
  <h2>Ask a Question</h2>
  ${context ? `<div class="context-preview"><strong>Context:</strong><br>${context.substring(0, 200)}${context.length > 200 ? '...' : ''}</div>` : ''}
  <div class="templates">
    ${templatesHtml}
  </div>
  <textarea id="custom-prompt" placeholder="Or type your own question..."></textarea>
  <div class="actions">
    <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
    <button class="btn btn-primary" onclick="send()">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    
    document.querySelectorAll('.template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const templateId = btn.dataset.id;
        const prompt = getTemplatePrompt(templateId);
        if (prompt) {
          vscode.postMessage({ type: 'send', prompt, templateId });
        }
      });
    });
    
    function send() {
      const custom = document.getElementById('custom-prompt').value.trim();
      if (custom) {
        vscode.postMessage({ type: 'send', prompt: custom, templateId: '' });
      }
    }
    
    function cancel() {
      vscode.postMessage({ type: 'dispose' });
    }
    
    function getTemplatePrompt(id) {
      const templates = ${JSON.stringify(templates)};
      const template = templates.find(t => t.id === id);
      return template ? template.prompt : '';
    }
    
    document.getElementById('custom-prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  </script>
</body>
</html>`;
  }
}
