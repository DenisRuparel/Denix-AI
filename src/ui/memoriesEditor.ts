import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RulesManager } from '../features/rules';
import { GuidelinesManager } from '../features/guidelines';

export class MemoriesEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'denix-ai.memoriesEditor';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _rulesManager: RulesManager,
    private readonly _guidelinesManager: GuidelinesManager
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionUri, 'dist')
      ]
    };

    // Read CSS
    const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css');
    let styleContent = '';
    try {
      styleContent = fs.readFileSync(stylePath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to read CSS file:', error);
    }

    const nonce = this._getNonce();
    const fileName = path.basename(document.uri.fsPath);
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);

    webviewPanel.webview.html = this._getHtmlForWebview(
      webviewPanel.webview,
      document.getText(),
      styleContent,
      nonce,
      fileName,
      relativePath
    );

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'save':
          this._updateDocument(document, message.content);
          break;
        case 'openGuidelines':
          await this._openGuidelines();
          break;
        case 'openRules':
          await this._openRules();
          break;
        case 'openFile':
          await this._openFileInEditor(document.uri);
          break;
      }
    });

    // Update webview when document changes
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({
          type: 'update',
          content: e.document.getText()
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    content: string,
    styleContent: string,
    nonce: string,
    fileName: string,
    relativePath: string
  ): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styleContent}</style>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            background: #0d1117;
            color: #e6edf3;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          
          .memories-editor-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          
          .memories-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            background: #161b22;
            border-bottom: 1px solid #30363d;
            min-height: 40px;
          }
          
          .memories-toolbar-left {
            display: flex;
            gap: 8px;
            align-items: center;
          }
          
          .memories-toolbar-right {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .memories-toolbar-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            color: #e6edf3;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          
          .memories-toolbar-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: #1f6feb;
          }
          
          .memories-toolbar-btn svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
          }
          
          .memories-toolbar-btn span {
            white-space: nowrap;
          }
          
          .memories-filename {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #8b949e;
            font-size: 13px;
          }
          
          .memories-filename-icon {
            width: 16px;
            height: 16px;
            color: #8b949e;
          }
          
          .memories-editor {
            flex: 1;
            padding: 16px;
            overflow: auto;
            background: #0d1117;
          }
          
          #memories-textarea {
            width: 100%;
            height: 100%;
            min-height: 400px;
            background: transparent;
            border: none;
            color: #e6edf3;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            outline: none;
            padding: 0;
          }
          
          #memories-textarea::placeholder {
            color: #6e7681;
          }
        </style>
        <title>${fileName}</title>
      </head>
      <body>
        <div class="memories-editor-container">
          <div class="memories-toolbar">
            <div class="memories-toolbar-left">
              <button class="memories-toolbar-btn" id="open-guidelines-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 5L8 2L14 5L14 11L8 14L2 11Z"/>
                  <path d="M8 2V14M2 5L8 8L14 5M2 11L8 8L14 11"/>
                </svg>
                <span>→ User Guidelines</span>
              </button>
              <button class="memories-toolbar-btn" id="open-rules-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4h9l3 3v13H6z"/>
                  <path d="M15 4v3h3"/>
                  <path d="M9 10h6M9 14h4"/>
                </svg>
                <span>→ Rules</span>
              </button>
            </div>
            <div class="memories-toolbar-right">
              <button class="memories-toolbar-btn" id="open-file-btn" style="background: transparent; border: none; padding: 4px 8px;">
                <svg class="memories-filename-icon" viewBox="0 0 16 16" fill="currentColor" style="width: 16px; height: 16px;">
                  <path d="M4 2h8l3 3v9H4V2zm8 1v3h3v8H5V3h7z"/>
                </svg>
                <span style="color: #8b949e; font-size: 13px;">${fileName}</span>
              </button>
            </div>
          </div>
          <div class="memories-editor">
            <textarea id="memories-textarea" spellcheck="false" placeholder="# Denix AI Memories&#10;&#10;Add your project memories here...">${this._escapeHtml(content)}</textarea>
          </div>
        </div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const textarea = document.getElementById('memories-textarea');
          const openGuidelinesBtn = document.getElementById('open-guidelines-btn');
          const openRulesBtn = document.getElementById('open-rules-btn');
          const openFileBtn = document.getElementById('open-file-btn');
          
          let saveTimeout = null;
          
          // Auto-save on input
          textarea.addEventListener('input', () => {
            if (saveTimeout) {
              clearTimeout(saveTimeout);
            }
            saveTimeout = setTimeout(() => {
              vscode.postMessage({
                type: 'save',
                content: textarea.value
              });
            }, 500);
          });
          
          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
              textarea.value = message.content;
            }
          });
          
          // Toolbar buttons
          openGuidelinesBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openGuidelines' });
          });
          
          openRulesBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openRules' });
          });
          
          openFileBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openFile' });
          });
          
          // Make textarea fill available height
          function resizeTextarea() {
            const container = document.querySelector('.memories-editor-container');
            const toolbar = document.querySelector('.memories-toolbar');
            const editor = document.querySelector('.memories-editor');
            if (container && toolbar && editor) {
              const containerHeight = container.clientHeight;
              const toolbarHeight = toolbar.clientHeight;
              const editorHeight = containerHeight - toolbarHeight;
              editor.style.height = editorHeight + 'px';
              textarea.style.height = editorHeight + 'px';
            }
          }
          
          window.addEventListener('resize', resizeTextarea);
          resizeTextarea();
          
          // Initial resize
          setTimeout(resizeTextarea, 100);
        </script>
      </body>
      </html>`;
  }

  private _escapeHtml(text: string): string {
    // Simple HTML escaping for use in template strings
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private _updateDocument(document: vscode.TextDocument, content: string): void {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      content
    );
    vscode.workspace.applyEdit(edit);
  }

  private async _openGuidelines(): Promise<void> {
    // Open guidelines in rules panel or editor
    await vscode.commands.executeCommand('denix-ai.openSettings');
  }

  private async _openRules(): Promise<void> {
    // Open rules panel
    await vscode.commands.executeCommand('denix-ai.openSettings');
  }

  private async _openFileInEditor(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
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

