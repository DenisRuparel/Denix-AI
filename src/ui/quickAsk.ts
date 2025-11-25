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
        <strong>${t.label}</strong>
        <span class="template-prompt">${t.prompt}</span>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 24px;
    }
    h2 { margin-bottom: 16px; }
    .context-preview {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 12px;
      color: #8b949e;
      max-height: 100px;
      overflow-y: auto;
    }
    .templates {
      display: grid;
      gap: 12px;
      margin-bottom: 16px;
    }
    .template-btn {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px;
      color: #e6edf3;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }
    .template-btn:hover {
      background: #21262d;
      border-color: #1f6feb;
    }
    .template-btn strong {
      display: block;
      margin-bottom: 4px;
    }
    .template-prompt {
      font-size: 12px;
      color: #8b949e;
    }
    #custom-prompt {
      width: 100%;
      min-height: 80px;
      padding: 12px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-family: inherit;
      margin-bottom: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .btn-primary {
      background: #1f6feb;
      color: white;
    }
    .btn-secondary {
      background: #21262d;
      color: #e6edf3;
      border: 1px solid #30363d;
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
    let selectedTemplate = null;
    
    document.querySelectorAll('.template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.template-btn').forEach(b => b.style.borderColor = '#30363d');
        btn.style.borderColor = '#1f6feb';
        selectedTemplate = btn.dataset.id;
        document.getElementById('custom-prompt').value = '';
      });
    });
    
    function send() {
      const custom = document.getElementById('custom-prompt').value.trim();
      const prompt = custom || (selectedTemplate ? getTemplatePrompt(selectedTemplate) : '');
      if (prompt) {
        vscode.postMessage({ type: 'send', prompt, templateId: selectedTemplate || '' });
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
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        send();
      }
    });
  </script>
</body>
</html>`;
  }
}
