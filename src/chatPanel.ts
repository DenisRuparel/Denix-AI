import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * OpenRouter API response structure
 */
interface ChatResponse {
  id?: string;
  model?: string;
  provider?: string;
  choices?: {
    message?: {
      content?: string;
      role?: string;
    };
    delta?: {
      content?: string;
    };
    finish_reason?: string;
    index?: number;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
}

/**
 * Message types for communication between extension and webview
 */
export interface WebviewMessage {
  type: 'userMessage' | 'aiResponse' | 'command' | 'fileAttach' | 'imageAttach' | 
        'modelChange' | 'activeFileChange' | 'removeAttachment' | 'previewImage' |
        'initialize' | 'updateState' | 'error' | 'typingIndicator';
  data?: any;
  payload?: any;
}

/**
 * Attachment data structure
 */
export interface Attachment {
  type: 'file' | 'image';
  path: string;
  name: string;
  content?: string; // For files: file content, for images: base64 data
  thumbnail?: string; // For images: base64 thumbnail
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  timestamp: number;
}

/**
 * Chat panel state
 */
export interface ChatState {
  threadId: string;
  messages: ChatMessage[];
  attachments: Attachment[];
  selectedModel: string;
  autoMode: boolean;
  activeTab: 'thread' | 'tasks' | 'edits';
  currentFile?: string;
}

/**
 * Chat Panel Provider - Manages the webview and handles all communication
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'denix-ai-chat';
  private _view?: vscode.WebviewView;
  private _state: ChatState;
  private _disposables: vscode.Disposable[] = [];
  private _activeEditorListener?: vscode.Disposable;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    // Initialize state
    this._state = {
      threadId: `thread-${Date.now()}`,
      messages: [],
      attachments: [],
      selectedModel: vscode.workspace.getConfiguration('denix-ai').get<string>('model', 'anthropic/claude-3.5-sonnet'),
      autoMode: true,
      activeTab: 'thread',
      currentFile: undefined
    };

    // Load persisted state
    this._loadState();

    // Listen for active editor changes
    this._setupActiveEditorListener();
  }

  /**
   * Resolve webview view - called when webview is created
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionUri, 'dist')
      ]
    };

    // Set initial HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );

    // Send initial state to webview
    this._updateWebviewState();

    // Handle visibility changes
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._updateWebviewState();
        this._updateActiveFile();
      }
    });
  }

  /**
   * Get HTML content for webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get paths to resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    
    // Read and inline CSS
    const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css');
    let styleContent = '';
    try {
      styleContent = fs.readFileSync(stylePath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to read CSS file:', error);
    }

    // Use a nonce to only allow specific scripts to be run
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styleContent}</style>
        <title>Denix - AI Chat</title>
      </head>
      <body>
        <div id="app">
          <!-- Header -->
          <div class="header">
            <div class="header-left">
              <span class="app-name">New Agent</span>
              <button class="icon-btn menu-btn" id="menu-btn" title="Menu">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>
            </div>
            <div class="header-right">
              <button class="icon-btn agent-btn" id="agent-btn" title="Select Agent">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0L10.5 5.5L16 8L10.5 10.5L8 16L5.5 10.5L0 8L5.5 5.5L8 0Z"/>
                </svg>
              </button>
              <button class="icon-btn plus-btn" id="plus-btn" title="New Thread">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2V14M2 8H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="nav-tabs">
            <button class="nav-tab active" data-tab="thread" id="tab-thread">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2L14 2M2 8L14 8M2 14L14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span>Thread</span>
            </button>
            <button class="nav-tab" data-tab="tasks" id="tab-tasks">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4L6 8L14 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
              <span>Tasks</span>
            </button>
            <button class="nav-tab" data-tab="edits" id="tab-edits">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 2L14 5L11 8M5 8L2 5L5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
              <span>Edits</span>
            </button>
          </div>

          <!-- Main Content -->
          <div class="content" id="content">
            <div class="welcome-card" id="welcome-card">
              <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2L14 2M2 8L14 8M2 14L14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <h2>New Agent Thread</h2>
              <p>Work with your agent to use tools and make file edits.</p>
            </div>
            <div class="messages" id="messages"></div>
          </div>

          <!-- Input Area -->
          <div class="input-area">
            <!-- Top Row: Context Pills & Quick Actions -->
            <div class="pills-row">
              <div class="quick-actions">
                <button class="icon-btn" id="mention-btn" aria-label="Mention" title="Mention">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8C0 12.42 3.58 16 8 16C12.42 16 16 12.42 16 8C16 3.58 12.42 0 8 0ZM8 14C4.69 14 2 11.31 2 8C2 4.69 4.69 2 8 2C11.31 2 14 4.69 14 8C14 11.31 11.31 14 8 14Z"/>
                  </svg>
                </button>
                <button class="icon-btn" id="trash-btn" aria-label="Clear" title="Clear all">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5 2V1C5 0.447715 5.44772 0 6 0H10C10.5523 0 11 0.447715 11 1V2H14C14.5523 2 15 2.44772 15 3C15 3.55228 14.5523 4 14 4H13V13C13 14.1046 12.1046 15 11 15H5C3.89543 15 3 14.1046 3 13V4H2C1.44772 4 1 3.55228 1 3C1 2.44772 1.44772 2 2 2H5ZM6 1V2H10V1H6ZM5 4V13H11V4H5Z"/>
                  </svg>
                </button>
                <button class="icon-btn" id="copy-btn" aria-label="Copy" title="Copy">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="4" y="4" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <path d="M4 4H2V14H12V12" stroke="currentColor" stroke-width="1.5" fill="none"/>
                  </svg>
                </button>
                <button class="icon-btn" id="format-text-btn" aria-label="Format text" title="Format text">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2V14M8 2V14M12 2V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="context-pills" id="context-pills"></div>
            </div>
            
            <!-- Middle: Text Input Area -->
            <div class="input-wrapper">
              <textarea 
                id="message-input" 
                placeholder="Instruct your Denix agent"
                rows="1"
                aria-label="Message input"
              ></textarea>
            </div>
            
            <!-- Bottom Row: Action Buttons -->
            <div class="actions-row">
              <div class="actions-left">
                <button class="toggle-btn" id="auto-btn" aria-label="Auto mode" title="Auto mode">
                  <span class="toggle-indicator">◉</span>
                  <span>Auto</span>
                </button>
                <button class="icon-btn" id="format-btn" aria-label="Format" title="Format">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2H14M2 8H14M2 14H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
                <button class="model-btn" id="model-btn" aria-label="Select model" title="Select model">
                  <span class="model-icon">🤖</span>
                  <span class="model-name">Claud...</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" class="dropdown-arrow">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                  </svg>
                </button>
              </div>
              <div class="actions-right">
                <button class="icon-btn" id="attach-btn" aria-label="Attach file" title="Attach file">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10.5 2L14 5.5L10.5 9M5.5 9L2 5.5L5.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                  </svg>
                </button>
                <button class="icon-btn" id="settings-btn" aria-label="Settings" title="Settings">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="2" fill="currentColor"/>
                    <path d="M8 1V3M8 13V15M15 8H13M3 8H1M12.364 3.636L10.95 5.05M5.05 10.95L3.636 12.364M12.364 12.364L10.95 10.95M5.05 5.05L3.636 3.636" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
                <button class="send-btn" id="send-btn" aria-label="Send message" title="Send message" disabled>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 8L13 3L9 8L13 13L3 8Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Image Preview Modal -->
        <div class="image-modal" id="image-modal">
          <div class="image-modal-content">
            <button class="image-modal-close" id="image-modal-close">&times;</button>
            <img id="image-modal-img" src="" alt="Preview">
          </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  /**
   * Handle messages from webview
   */
  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'initialize':
        this._updateWebviewState();
        break;

      case 'userMessage':
        await this._handleUserMessage(message.data);
        break;

      case 'fileAttach':
        await this._handleFileAttach(message.data);
        break;

      case 'imageAttach':
        await this._handleImageAttach(message.data);
        break;

      case 'removeAttachment':
        this._removeAttachment(message.data);
        break;

      case 'previewImage':
        this._previewImage(message.data);
        break;

      case 'modelChange':
        this._changeModel(message.data);
        break;

      case 'command':
        await this._handleCommand(message.data);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Handle user message - send to AI and get response
   */
  private async _handleUserMessage(data: { content: string; attachments?: Attachment[] }): Promise<void> {
    const { content, attachments = [] } = data;

    if (!content.trim() && attachments.length === 0) {
      return;
    }

    // Add user message to state
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      attachments: [...attachments],
      timestamp: Date.now()
    };

    this._state.messages.push(userMessage);
    this._saveState();
    this._updateWebviewState();

    // Show typing indicator
    this._sendMessageToWebview({
      type: 'typingIndicator',
      data: { active: true }
    });

    // Clear attachments after sending
    this._state.attachments = [];
    this._updateWebviewState();

    try {
      // Get API key and model
      const config = vscode.workspace.getConfiguration('denix-ai');
      const apiKey = config.get<string>('openRouterApiKey');
      const model = this._state.selectedModel;

      if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Please set it in settings.');
      }

      // Build messages array for API
      const apiMessages: Array<{ role: string; content: string }> = [
        {
          role: 'system',
          content: 'You are an expert AI coding assistant. Help users with code explanations, debugging, and development tasks.'
        }
      ];

      // Add conversation history
      for (const msg of this._state.messages) {
        let messageContent = msg.content;
        
        // Add attachment context
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.type === 'file' && att.content) {
              messageContent += `\n\n[File: ${att.name}]\n${att.content}`;
            } else if (att.type === 'image' && att.content) {
              messageContent += `\n\n[Image: ${att.name}]`;
            }
          }
        }

        apiMessages.push({
          role: msg.role,
          content: messageContent
        });
      }

      // Call OpenRouter API
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/DenisRuparel/Denix-AI',
          'X-Title': 'Denix AI Assistant',
        },
        body: JSON.stringify({
          model: model,
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: HTTP ${response.status} - ${errorText}`);
      }

      const data = await response.json() as ChatResponse;

      // Hide typing indicator
      this._sendMessageToWebview({
        type: 'typingIndicator',
        data: { active: false }
      });

      // Extract AI response
      let aiContent = '';
      if (data.choices && data.choices.length > 0) {
        aiContent = data.choices[0].message?.content || '';
      }

      if (!aiContent) {
        throw new Error('AI returned empty response');
      }

      // Add AI message to state
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: aiContent,
        timestamp: Date.now()
      };

      this._state.messages.push(aiMessage);
      this._saveState();
      this._updateWebviewState();

    } catch (error: any) {
      // Hide typing indicator
      this._sendMessageToWebview({
        type: 'typingIndicator',
        data: { active: false }
      });

      // Show error message
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `**Error:** ${error.message || 'An error occurred while processing your request.'}`,
        timestamp: Date.now()
      };

      this._state.messages.push(errorMessage);
      this._saveState();
      this._updateWebviewState();

      vscode.window.showErrorMessage(`AI Error: ${error.message}`);
    }
  }

  /**
   * Handle file attachment
   */
  private async _handleFileAttach(data: { path?: string }): Promise<void> {
    try {
      let filePath: string | undefined = data.path;

      if (!filePath) {
        // Open file picker
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Attach File'
        });

        if (!files || files.length === 0) {
          return;
        }

        filePath = files[0].fsPath;
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return;
      }

      // Read file content
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);

      // Check if already attached
      const existingIndex = this._state.attachments.findIndex(
        att => att.path === filePath && att.type === 'file'
      );

      if (existingIndex >= 0) {
        return; // Already attached
      }

      // Add to attachments
      const attachment: Attachment = {
        type: 'file',
        path: filePath,
        name: fileName,
        content: fileContent
      };

      this._state.attachments.push(attachment);
      this._saveState();
      this._updateWebviewState();

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to attach file: ${error.message}`);
    }
  }

  /**
   * Handle image attachment
   */
  private async _handleImageAttach(data: { path?: string; base64?: string }): Promise<void> {
    try {
      let imagePath: string | undefined = data.path;
      let base64Data: string | undefined = data.base64;

      if (!imagePath && !base64Data) {
        // Open image picker
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Attach Image',
          filters: {
            'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
          }
        });

        if (!files || files.length === 0) {
          return;
        }

        imagePath = files[0].fsPath;
      }

      if (imagePath && !base64Data) {
        // Read and convert to base64
        const imageBuffer = fs.readFileSync(imagePath);
        base64Data = `data:image/${path.extname(imagePath).slice(1)};base64,${imageBuffer.toString('base64')}`;
      }

      if (!base64Data) {
        return;
      }

      const fileName = imagePath ? path.basename(imagePath) : 'image.png';

      // Use the same image for thumbnail (in production, you'd create a smaller version)
      // For now, we'll use the full image as thumbnail - it will be scaled by CSS
      const thumbnail = base64Data;

      // Check if already attached
      if (imagePath) {
        const existingIndex = this._state.attachments.findIndex(
          att => att.path === imagePath && att.type === 'image'
        );

        if (existingIndex >= 0) {
          return; // Already attached
        }
      }

      // Add to attachments
      const attachment: Attachment = {
        type: 'image',
        path: imagePath || '',
        name: fileName,
        content: base64Data,
        thumbnail: thumbnail
      };

      this._state.attachments.push(attachment);
      this._saveState();
      this._updateWebviewState();

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to attach image: ${error.message}`);
    }
  }

  /**
   * Create thumbnail from base64 image
   */
  private async _createThumbnail(base64Data: string): Promise<string> {
    // For now, return the same image (in production, use canvas or image processing library)
    // This is a simplified version - you'd want to actually resize the image
    return base64Data;
  }

  /**
   * Remove attachment
   */
  private _removeAttachment(data: { index: number }): void {
    const { index } = data;
    if (index >= 0 && index < this._state.attachments.length) {
      this._state.attachments.splice(index, 1);
      this._saveState();
      this._updateWebviewState();
    }
  }

  /**
   * Preview image in modal
   */
  private _previewImage(data: { src: string }): void {
    this._sendMessageToWebview({
      type: 'previewImage',
      data: { src: data.src }
    });
  }

  /**
   * Change AI model
   */
  private _changeModel(data: { model: string }): void {
    this._state.selectedModel = data.model;
    this._saveState();
    this._updateWebviewState();
  }

  /**
   * Handle command from webview
   */
  private async _handleCommand(data: { command: string; payload?: any }): Promise<void> {
    switch (data.command) {
      case 'newThread':
        this._state.threadId = `thread-${Date.now()}`;
        this._state.messages = [];
        this._state.attachments = [];
        this._saveState();
        this._updateWebviewState();
        break;

      case 'toggleAuto':
        this._state.autoMode = !this._state.autoMode;
        this._saveState();
        this._updateWebviewState();
        break;

      case 'changeTab':
        this._state.activeTab = data.payload?.tab || 'thread';
        this._updateWebviewState();
        break;

      case 'selectModel':
        const model = await vscode.window.showQuickPick([
          'anthropic/claude-3.5-sonnet',
          'anthropic/claude-3-opus',
          'openai/gpt-4',
          'openai/gpt-3.5-turbo',
          'mistralai/mistral-7b-instruct'
        ], {
          placeHolder: 'Select AI Model'
        });
        if (model) {
          this._changeModel({ model });
        }
        break;

      default:
        console.warn('Unknown command:', data.command);
    }
  }

  /**
   * Setup active editor listener
   */
  private _setupActiveEditorListener(): void {
    this._activeEditorListener = vscode.window.onDidChangeActiveTextEditor(() => {
      this._updateActiveFile();
    });

    this._disposables.push(this._activeEditorListener);
    this._updateActiveFile();
  }

  /**
   * Update active file in state
   */
  private _updateActiveFile(): void {
    const editor = vscode.window.activeTextEditor;
    const currentFile = editor?.document.uri.fsPath;

    if (currentFile && currentFile !== this._state.currentFile) {
      this._state.currentFile = currentFile;
      
      // Auto-add current file to attachments if not already present
      const fileName = path.basename(currentFile);
      const existingIndex = this._state.attachments.findIndex(
        att => att.path === currentFile && att.type === 'file'
      );

      if (existingIndex < 0 && this._view?.visible) {
        // Auto-attach current file
        this._handleFileAttach({ path: currentFile });
      } else {
        this._updateWebviewState();
      }
    } else if (!currentFile) {
      this._state.currentFile = undefined;
      this._updateWebviewState();
    }
  }

  /**
   * Update webview with current state
   */
  private _updateWebviewState(): void {
    if (this._view) {
      this._sendMessageToWebview({
        type: 'updateState',
        data: this._state
      });
    }
  }

  /**
   * Send message to webview
   */
  private _sendMessageToWebview(message: WebviewMessage): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Load persisted state
   */
  private _loadState(): void {
    const saved = this._context.globalState.get<ChatState>('denix-ai-state');
    if (saved) {
      this._state = { ...this._state, ...saved };
    }
  }

  /**
   * Save state to persistent storage
   */
  private _saveState(): void {
    this._context.globalState.update('denix-ai-state', this._state);
  }

  /**
   * Generate nonce for CSP
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }
}

