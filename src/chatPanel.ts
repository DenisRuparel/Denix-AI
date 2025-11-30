import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MemoriesManager, MemoryEntry } from './features/memories';
import { GuidelinesManager } from './features/guidelines';
import { RulesManager, RuleFile } from './features/rules';
import { SelectionWatcher, SelectionContext } from './features/selection';
import { ContextManager } from './storage/contextManager';
import { QuickQuestionService, QuickQuestionTemplate } from './features/askQuestion';
import { SettingsPanel } from './ui/settingsPanel';
import { QuickAskPanel } from './ui/quickAsk';

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
        'initialize' | 'updateState' | 'error' | 'typingIndicator' | 
        'getCurrentPrompt' | 'currentPrompt' | 'dismissContext' | 'enhancedPrompt' |
        'getMentionItems' | 'mentionItems' | 'insertMention' | 'memoriesContent' |
        'guidelinesContent' | 'rulesList' | 'getSelection' | 'selectionData';
  data?: any;
  payload?: any;
}

/**
 * Attachment data structure
 */
export type AttachmentType = 'file' | 'image' | 'memory' | 'rule' | 'guideline' | 'selection';

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  path?: string;
  content?: string; // For files, image base64, memory/rule text
  thumbnail?: string; // For images: base64 thumbnail
  description?: string;
  auto?: boolean;
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
  private readonly _memoriesManager: MemoriesManager;
  private readonly _rulesManager: RulesManager;
  private readonly _guidelinesManager: GuidelinesManager;
  private readonly _selectionWatcher: SelectionWatcher;
  private readonly _contextManager: ContextManager;
  private readonly _quickQuestionService: QuickQuestionService;
  private _contextAttachments: Attachment[] = [];
  private _dismissedContextIds = new Set<string>();
  private _settingsPanel: SettingsPanel;
  private _lastKeywords: string[] = [];
  private readonly _workspaceRoot: string | undefined;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    memoriesManager: MemoriesManager,
    rulesManager: RulesManager,
    guidelinesManager: GuidelinesManager,
    selectionWatcher: SelectionWatcher,
    contextManager: ContextManager,
    quickQuestionService: QuickQuestionService
  ) {
    this._memoriesManager = memoriesManager;
    this._rulesManager = rulesManager;
    this._guidelinesManager = guidelinesManager;
    this._selectionWatcher = selectionWatcher;
    this._contextManager = contextManager;
    this._quickQuestionService = quickQuestionService;
    this._workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

    this._settingsPanel = new SettingsPanel(this._extensionUri);

    // Load persisted state
    this._loadState();

    // Listen for active editor changes
    this._setupActiveEditorListener();

    this._registerWatchers();
    // Prime context attachments
    this._updateContextAttachments().catch(console.error);
  }

  private _registerWatchers(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const patterns = [
      new vscode.RelativePattern(workspaceFolder, '.denix/memories.md'),
      new vscode.RelativePattern(workspaceFolder, '.denix/guidelines.txt'),
      new vscode.RelativePattern(workspaceFolder, '.denix/rules/**/*.md')
    ];

    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const refresh = () => this._updateContextAttachments().catch(console.error);
      watcher.onDidCreate(refresh, this, this._disposables);
      watcher.onDidChange(refresh, this, this._disposables);
      watcher.onDidDelete(refresh, this, this._disposables);
      this._disposables.push(watcher);
    }
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
    
    // Get media URI for icons
    const mediaUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media')
    );
    
    // Read and inline CSS
    const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css');
    let styleContent = '';
    try {
      styleContent = fs.readFileSync(stylePath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to read CSS file:', error);
    }
    
    // Read icon loader script
    const iconLoaderPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'iconLoader.js');
    let iconLoaderScript = '';
    try {
      iconLoaderScript = fs.readFileSync(iconLoaderPath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to read icon loader script:', error);
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
              <button class="icon-btn" id="hamburger-btn" aria-label="Menu" title="Menu">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3h12v1H2V3zm0 4h12v1H2V7zm0 4h12v1H2v-1z"/>
                </svg>
              </button>
            </div>
            <div class="header-center">
              <span class="project-title" id="project-title">Project summary: Denix AI</span>
            </div>
            <div class="header-right">
              <button class="icon-btn" id="plus-btn" aria-label="New thread" title="New thread">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
                </svg>
              </button>
              <div class="menu-wrapper">
                <button class="icon-btn" id="menu-btn" aria-label="More options" title="More options">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5"/>
                    <circle cx="8" cy="8" r="1.5"/>
                    <circle cx="8" cy="13" r="1.5"/>
                  </svg>
                </button>
                <div class="dropdown-menu" id="dropdown-menu">
                  <div class="dropdown-item" id="menu-settings">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                    </svg>
                    <span>Settings</span>
                  </div>
                  <div class="dropdown-item" id="menu-help">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                      <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
                    </svg>
                    <span>Help</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Threads Sidebar Panel -->
          <div class="threads-panel" id="threads-panel">
            <div class="threads-header">
              <button class="icon-btn back-btn" id="back-btn" title="Back">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10 2L4 8l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
              </button>
              <span class="threads-title">Threads</span>
              <div class="threads-actions">
                <button class="icon-btn refresh-btn" id="refresh-btn" title="Refresh">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3V1L5 4l3 3V5a5 5 0 110 10 5 5 0 01-5-5h2a3 3 0 103-3z" stroke="currentColor" stroke-width="1" fill="none"/>
                  </svg>
                </button>
                <button class="icon-btn add-thread-btn" id="add-thread-btn" title="New Thread">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2V14M2 8H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="threads-search">
              <div class="search-input-container">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="search-icon">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
                  <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <input
                  type="text"
                  class="search-input"
                  id="search-threads-input"
                  placeholder="Search threads..."
                  autocomplete="off"
                />
                <button class="icon-btn clear-search-btn hidden" id="clear-search-btn" title="Clear search">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="threads-content" id="threads-content">
              <!-- Thread groups will be dynamically added here -->
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
              <span class="tab-counter" id="tasks-counter">0/2</span>
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
              <div class="quick-actions" role="toolbar" aria-label="Context tools">
                <div class="mention-wrapper">
                  <button class="icon-btn mention-btn" id="mention-btn" aria-label="Open mention menu" aria-haspopup="true" aria-expanded="false" title="Mention">
                    <svg class="mention-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 4c-4.418 0-8 3.134-8 7s3.582 7 8 7c2.21 0 4-1.79 4-4V7.5a1.5 1.5 0 1 1 3 0V11c0 3.314-2.686 6-6 6s-6-2.686-6-6 2.686-6 6-6c1.657 0 3 1.343 3 3"/>
                      <path d="M10 10.5c0 .828.672 1.5 1.5 1.5s1.5-.672 1.5-1.5-.672-1.5-1.5-1.5S10 9.672 10 10.5Z"/>
                    </svg>
                  </button>
                  <div class="mention-picker-overlay" id="mention-picker-overlay"></div>
                  <div class="mention-picker" id="mention-picker" role="menu" aria-hidden="true">
                    <div class="mention-header">
                      <div class="mention-header-title">QUICK ACTIONS</div>
                      <div class="mention-search-container">
                        <svg class="mention-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                          <circle cx="7" cy="7" r="5"/>
                          <path d="M10.5 10.5L14 14"/>
                        </svg>
                        <input type="text" class="mention-search-input" id="mention-search-input" placeholder="Add files, folders, docs..." autocomplete="off" aria-label="Filter mentions" />
                      </div>
                    </div>
                    <div class="mention-suggestions" id="mention-suggestions" role="listbox" tabindex="-1"></div>
                  </div>
                </div>
                <button class="icon-btn" id="memories-btn" aria-label="Open Denix memories" aria-haspopup="true" aria-expanded="false" title="Memories">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4.5 8.5C6 6 8.667 4 12 4s6 2 7.5 4.5"/>
                    <path d="M4.5 15.5C6 18 8.667 20 12 20s6-2 7.5-4.5"/>
                    <path d="M4 12h16"/>
                    <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
                  </svg>
                </button>
                <button class="icon-btn" id="ask-question-btn" aria-label="Ask Question" title="Ask Question">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="6"/>
                    <path d="M8 5V8M8 11H8.01"/>
                  </svg>
                </button>
                <button class="icon-btn" id="selection-btn" aria-label="Show selected text actions" aria-haspopup="true" aria-expanded="false" title="Selected Text">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="6" width="16" height="12" rx="2"/>
                    <path d="M8 2v4M16 2v4M8 18v4M16 18v-4"/>
                    <path d="M9.5 11.5h5"/>
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
              <!-- Custom @ Menu -->
              <div class="at-menu" id="at-menu" role="menu" aria-hidden="true">
                <div class="at-menu-header" id="at-menu-header"></div>
                <div class="at-menu-items" id="at-menu-items"></div>
              </div>
            </div>
            
            <!-- Bottom Row: Action Buttons -->
            <div class="actions-row">
              <div class="actions-left">
                <div class="modern-toggle-switch" id="auto-switch" role="switch" aria-checked="false" aria-label="Auto mode" tabindex="0">
                  <div class="toggle-track">
                    <div class="toggle-knob"></div>
                    <span class="toggle-label">Auto</span>
                  </div>
                </div>
                <button class="icon-btn" id="enhance-btn" aria-label="Enhance Prompt" title="Enhance Prompt">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1L10 6L15 8L10 10L8 15L6 10L1 8L6 6L8 1Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                  </svg>
                </button>
                <button class="model-btn" id="model-btn" aria-label="Select model" title="Select model">
                  <img class="model-icon-img" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'model-select.png'))}" alt="Model" onerror="this.style.display='none';" />
                  <span class="model-name">Claude...</span>
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
                <button class="stop-btn" id="stop-btn" aria-label="Stop generation" title="Stop generation">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="4" y="4" width="8" height="8" fill="currentColor"/>
                  </svg>
                </button>
                <button class="send-btn" id="send-btn" aria-label="Send message" title="Send message" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Workspace Panels & Tooltips -->
        <div class="panel-overlay" id="panel-overlay" aria-hidden="true"></div>


        <!-- Image Preview Modal -->
        <div class="image-modal" id="image-modal">
          <div class="image-modal-content">
            <button class="image-modal-close" id="image-modal-close">&times;</button>
            <img id="image-modal-img" src="" alt="Preview">
          </div>
        </div>

        <script nonce="${nonce}">
          window.mediaUri = ${JSON.stringify(mediaUri.toString())};
        </script>
        <script nonce="${nonce}">
          ${iconLoaderScript}
        </script>
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

      case 'getCurrentPrompt':
        const input = this._view?.webview;
        if (input) {
          this._sendMessageToWebview({
            type: 'currentPrompt',
            data: '' // Will be filled by webview
          });
        }
        break;

      case 'dismissContext':
        this._dismissedContextIds.add(message.data.id);
        await this._updateContextAttachments();
        break;

      case 'getMentionItems':
        const mentionItems = await this._getMentionItems(message.data?.query || '');
        this._sendMessageToWebview({
          type: 'mentionItems',
          data: mentionItems
        });
        break;

      case 'getSelection':
        const selection = this._selectionWatcher.getSelection();
        if (selection) {
          this._sendMessageToWebview({
            type: 'selectionData',
            data: {
              text: selection.text,
              fileName: selection.fileName,
              startLine: selection.startLine,
              endLine: selection.endLine
            }
          });
        }
        break;

      case 'insertMention':
        // Handle mention insertion - this will be handled by webview
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

    // Merge user attachments with context attachments
    const allAttachments = [...attachments, ...this._contextAttachments];

    if (!content.trim() && allAttachments.length === 0) {
      return;
    }

    // Add user message to state
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      attachments: allAttachments,
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

    // Clear user attachments after sending (keep context attachments)
    this._state.attachments = [];
    this._updateWebviewState();

    try {
      // Get API key and model
      const config = vscode.workspace.getConfiguration('denix-ai');
      const apiKey = config.get<string>('openRouterApiKey');
      const model = this._state.selectedModel;
      const maxTokens = config.get<number>('maxTokens', 500);

      if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Please set it in settings.');
      }

      // Build context from memories, guidelines, rules
      const keywords = this._extractKeywords();
      const context = await this._contextManager.buildContext(keywords);
      
      // Build system message with guidelines
      let systemContent = 'You are an expert AI coding assistant. Help users with code explanations, debugging, and development tasks.';
      if (context.guidelines) {
        systemContent += `\n\n## User Guidelines:\n${context.guidelines}`;
      }
      if (context.relevantMemories.length > 0) {
        systemContent += `\n\n## Project Memories:\n${context.relevantMemories.join('\n\n')}`;
      }

      // Build messages array for API
      const apiMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
        {
          role: 'system',
          content: systemContent
        }
      ];

      // Check if model supports vision (images)
      const isVisionModel = this._isVisionModel(model);

      // Add conversation history
      for (const msg of this._state.messages) {
        let messageContent = msg.content;
        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        
        // Add text content
        if (messageContent.trim()) {
          if (isVisionModel) {
            contentParts.push({ type: 'text', text: messageContent });
          } else {
            // For non-vision models, keep text as string
            messageContent = messageContent;
          }
        }
        
        // Add attachment context
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.type === 'file' && att.content) {
              const fileContext = `\n\n[File: ${att.name}]\n${att.content}`;
              if (isVisionModel) {
                // Update the last text part or add new one
                if (contentParts.length > 0 && contentParts[contentParts.length - 1].type === 'text') {
                  contentParts[contentParts.length - 1].text += fileContext;
                } else {
                  contentParts.push({ type: 'text', text: fileContext });
                }
              } else {
                messageContent += fileContext;
              }
            } else if (att.type === 'image' && att.content) {
              if (isVisionModel) {
                // For vision models, add image as image_url object
                // Extract base64 data (remove data:image/...;base64, prefix if present)
                let imageUrl = att.content;
                if (!imageUrl.startsWith('data:')) {
                  imageUrl = `data:image/png;base64,${imageUrl}`;
                }
                contentParts.push({
                  type: 'image_url',
                  image_url: { url: imageUrl }
                });
              } else {
                // For non-vision models, just mention the image
                messageContent += `\n\n[Image: ${att.name}]`;
              }
            }
          }
        }

        // Build message based on model type
        if (isVisionModel && contentParts.length > 0) {
          apiMessages.push({
            role: msg.role,
            content: contentParts
          });
        } else {
          apiMessages.push({
            role: msg.role,
            content: messageContent
          });
        }
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
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: HTTP ${response.status}`;
        
        // Parse error response for better messages
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            if (response.status === 402) {
              // Credit/balance error
              errorMessage = `**Insufficient Credits**\n\n${errorData.error.message || 'You need more credits to make this request.'}\n\n**Solution:**\n- Reduce max_tokens in settings (currently: ${maxTokens})\n- Add credits at https://openrouter.ai/settings/credits\n- Or upgrade to a paid account`;
            } else {
              errorMessage = errorData.error.message || errorMessage;
            }
          }
        } catch {
          // If parsing fails, use the raw error text
          errorMessage = `${errorMessage} - ${errorText}`;
        }
        
        throw new Error(errorMessage);
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
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
  private async _handleImageAttach(data: { path?: string; base64?: string; name?: string }): Promise<void> {
    try {
      let imagePath: string | undefined = data.path;
      let base64Data: string | undefined = data.base64;
      const providedName = data.name;

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

      const fileName = providedName || (imagePath ? path.basename(imagePath) : `image-${Date.now()}.png`);

      // Use the same image for thumbnail (in production, you'd create a smaller version)
      // For now, we'll use the full image as thumbnail - it will be scaled by CSS
      const thumbnail = base64Data;

      // Check if already attached
      const existingIndex = this._state.attachments.findIndex(
        att =>
          att.type === 'image' &&
          ((imagePath && att.path === imagePath) || (!imagePath && att.content === base64Data))
      );

      if (existingIndex >= 0) {
        return; // Already attached
      }

      // Add to attachments
      const attachment: Attachment = {
        id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

      case 'openMemories':
        await this.openMemories();
        break;

      case 'openSettings':
        await this.openSettings();
        break;

      case 'openHelp':
        await this.openHelp();
        break;

      case 'askQuestion':
        await this.openQuickAsk();
        break;

      case 'enhancePrompt':
        await this.enhanceCurrentPrompt();
        break;

      case 'toggleSelection':
        // Toggle selection context
        const selection = this._selectionWatcher.getSelection();
        if (selection) {
          if (this._dismissedContextIds.has('selection')) {
            this._dismissedContextIds.delete('selection');
          } else {
            this._dismissedContextIds.add('selection');
          }
          await this._updateContextAttachments();
        }
        break;

      case 'selectModel':
        await this.selectModel();
        break;

      case 'changeTab':
        this._state.activeTab = data.payload?.tab || 'thread';
        this._updateWebviewState();
        break;

      case 'clearAttachments':
        this._state.attachments = [];
        this._saveState();
        this._updateWebviewState();
        break;

      case 'clearContext':
        this.clearContextAttachments();
        break;

      case 'loadMemories':
        {
          const markdown = await this._memoriesManager.loadMemories();
          this._sendMessageToWebview({ type: 'memoriesContent', data: markdown });
        }
        break;

      case 'saveMemories':
        if (typeof data.payload?.content === 'string') {
          await this._memoriesManager.saveMemories(data.payload.content);
        }
        break;

      case 'listRules':
        {
          const rules = await this._rulesManager.listRuleFiles();
          this._sendMessageToWebview({ type: 'rulesList', data: rules });
        }
        break;

      case 'createRule':
        if (data.payload?.name) {
          await this._rulesManager.createRuleFile(data.payload.name);
          const updatedRules = await this._rulesManager.listRuleFiles();
          this._sendMessageToWebview({ type: 'rulesList', data: updatedRules });
        }
        break;

      case 'openRule':
        if (data.payload?.path) {
          try {
            const document = await vscode.workspace.openTextDocument(data.payload.path);
            await vscode.window.showTextDocument(document, { preview: false });
          } catch (error) {
            vscode.window.showErrorMessage(`Unable to open rule file: ${String(error)}`);
          }
        }
        break;

      case 'loadGuidelines':
        {
          const guidelines = await this._guidelinesManager.loadGuidelines();
          this._sendMessageToWebview({ type: 'guidelinesContent', data: guidelines });
        }
        break;

      case 'saveGuidelines':
        if (typeof data.payload?.content === 'string') {
          await this._guidelinesManager.saveGuidelines(data.payload.content);
        }
        break;

      case 'importRules':
        await this._handleImportRules(data.payload?.files);
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

      case 'switchThread':
        // Switch to a different thread
        if (data.payload?.threadId) {
          await this._loadThread(data.payload.threadId);
        }
        break;

      case 'renameThread':
        // Rename thread
        if (data.payload?.threadId) {
          const newName = await vscode.window.showInputBox({
            prompt: 'Enter new thread name',
            placeHolder: 'Thread name'
          });
          if (newName) {
            await this._renameThread(data.payload.threadId, newName);
          }
        }
        break;

      case 'pinThread':
        // Pin/unpin thread
        if (data.payload?.threadId) {
          await this._togglePinThread(data.payload.threadId);
        }
        break;

      case 'deleteThread':
        // Delete thread
        if (data.payload?.threadId) {
          const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this thread?',
            { modal: true },
            'Delete'
          );
          if (confirm === 'Delete') {
            await this._deleteThread(data.payload.threadId);
          }
        }
        break;

      case 'exportThread':
        // Export thread conversation
        if (data.payload?.threadId) {
          await this._exportThread(data.payload.threadId);
        }
        break;

      case 'importThread':
        // Import thread conversation
        await this._importThread();
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
      // Include context attachments in state
      const selectionContext = this._selectionWatcher.getSelection();
      const stateWithContext = {
        ...this._state,
        contextAttachments: this._contextAttachments,
        hasSelection: selectionContext !== null,
        selectionContext
      };
      this._sendMessageToWebview({
        type: 'updateState',
        data: stateWithContext
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
   * Update context attachments from memories, rules, selection
   */
  private async _updateContextAttachments(): Promise<void> {
    const keywords = this._extractKeywords();
    const context = await this._contextManager.buildContext(keywords);
    
    this._contextAttachments = [];
    
    // Add relevant memories
    if (context.relevantMemories.length > 0) {
      this._contextAttachments.push({
        id: 'memories',
        type: 'file',
        path: '.denix/memories.md',
        name: 'Memories',
        content: context.relevantMemories.join('\n\n')
      });
    }
    
    // Add active rules
    for (const rule of context.rules) {
      if (!this._dismissedContextIds.has(`rule-${rule.name}`)) {
        this._contextAttachments.push({
          id: `rule-${rule.name}`,
          type: 'file',
          path: rule.path,
          name: `@${rule.name}`,
          content: rule.content
        });
      }
    }
    
    // Add selection if available
    if (context.selection && !this._dismissedContextIds.has('selection')) {
      this._contextAttachments.push({
        id: 'selection',
        type: 'file',
        path: context.selection.uri,
        name: `${context.selection.fileName}:${context.selection.startLine}-${context.selection.endLine}`,
        content: context.selection.text
      });
    }
    
    this._updateWebviewState();
  }

  /**
   * Extract keywords from current conversation for context matching
   */
  private _extractKeywords(): string[] {
    const keywords: string[] = [];
    const lastMessages = this._state.messages.slice(-3);
    
    for (const msg of lastMessages) {
      const words = msg.content.toLowerCase().split(/\s+/);
      keywords.push(...words.filter(w => w.length > 4));
    }
    
    return [...new Set(keywords)];
  }

  /**
   * Check if the model supports vision (images)
   */
  private _isVisionModel(model: string): boolean {
    const visionModels = [
      'gpt-4-vision',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3-5-sonnet',
      'claude-3-5-haiku',
      'openai/gpt-4-vision-preview',
      'openai/gpt-4-turbo',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-5-haiku'
    ];

    return visionModels.some(vm => model.toLowerCase().includes(vm.toLowerCase()));
  }

  /**
   * Thread Management Methods
   */

  private async _loadThread(threadId: string): Promise<void> {
    // Load thread from storage
    const threadData = this._context.workspaceState.get<ChatState>(`thread-${threadId}`);
    if (threadData) {
      this._state = threadData;
      this._saveState();
      this._updateWebviewState();
    }
  }

  private async _renameThread(threadId: string, newName: string): Promise<void> {
    // Rename thread - update thread metadata
    const threadData = this._context.workspaceState.get<ChatState>(`thread-${threadId}`);
    if (threadData) {
      // Store thread name in metadata
      await this._context.workspaceState.update(`thread-${threadId}-name`, newName);
      vscode.window.showInformationMessage(`Thread renamed to: ${newName}`);
    }
  }

  private async _togglePinThread(threadId: string): Promise<void> {
    // Toggle pin status
    const isPinned = this._context.workspaceState.get<boolean>(`thread-${threadId}-pinned`, false);
    await this._context.workspaceState.update(`thread-${threadId}-pinned`, !isPinned);
    vscode.window.showInformationMessage(isPinned ? 'Thread unpinned' : 'Thread pinned');
  }

  private async _deleteThread(threadId: string): Promise<void> {
    // Delete thread from storage
    await this._context.workspaceState.update(`thread-${threadId}`, undefined);
    await this._context.workspaceState.update(`thread-${threadId}-name`, undefined);
    await this._context.workspaceState.update(`thread-${threadId}-pinned`, undefined);

    // If deleting current thread, create new one
    if (this._state.threadId === threadId) {
      this._state.threadId = `thread-${Date.now()}`;
      this._state.messages = [];
      this._state.attachments = [];
      this._saveState();
      this._updateWebviewState();
    }

    vscode.window.showInformationMessage('Thread deleted');
  }

  private async _exportThread(threadId: string): Promise<void> {
    // Export thread conversation to JSON file
    const threadData = this._context.workspaceState.get<ChatState>(`thread-${threadId}`);
    if (!threadData) {
      vscode.window.showErrorMessage('Thread not found');
      return;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`thread-${threadId}.json`),
      filters: { 'JSON': ['json'] }
    });

    if (uri) {
      const fs = require('fs');
      fs.writeFileSync(uri.fsPath, JSON.stringify(threadData, null, 2));
      vscode.window.showInformationMessage('Thread exported successfully');
    }
  }

  private async _importThread(): Promise<void> {
    // Import thread conversation from JSON file
    const uri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON': ['json'] }
    });

    if (uri && uri[0]) {
      const fs = require('fs');
      try {
        const content = fs.readFileSync(uri[0].fsPath, 'utf8');
        const threadData = JSON.parse(content) as ChatState;

        // Generate new thread ID
        const newThreadId = `thread-${Date.now()}`;
        threadData.threadId = newThreadId;

        // Save imported thread
        await this._context.workspaceState.update(`thread-${newThreadId}`, threadData);

        // Load the imported thread
        this._state = threadData;
        this._saveState();
        this._updateWebviewState();

        vscode.window.showInformationMessage('Thread imported successfully');
      } catch (error) {
        vscode.window.showErrorMessage('Failed to import thread: Invalid file format');
      }
    }
  }

  // Public methods for commands
  public async openMemories(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const memoriesUri = vscode.Uri.joinPath(workspaceFolder.uri, '.denix', 'memories.md');
    
    // Ensure file exists
    try {
      await vscode.workspace.fs.stat(memoriesUri);
    } catch {
      // Create file if it doesn't exist
      const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.denix');
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(memoriesUri, Buffer.from('# Denix AI Memories\n\n', 'utf8'));
    }

    // Open with custom editor
    await vscode.commands.executeCommand(
      'vscode.openWith',
      memoriesUri,
      'denix-ai.memoriesEditor'
    );
  }

  public async openSettings(): Promise<void> {
    await this._settingsPanel.show();
  }

  public async openHelp(): Promise<void> {
    // Open help documentation or show help dialog
    const helpUrl = 'https://github.com/yourusername/denix-ai#readme';
    await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
  }

  public async openQuickAsk(): Promise<void> {
    const templates = this._quickQuestionService.getTemplates();
    const selection = this._selectionWatcher.getSelection();
    const context = selection ? `File: ${selection.fileName}\nLinescls: ${selection.startLine}-${selection.endLine}\n\n${selection.text}` : '';
    
    const quickAsk = new QuickAskPanel(this._extensionUri, async (prompt: string, templateId: string) => {
      const fullPrompt = this._quickQuestionService.buildPrompt(templateId, prompt);
      await this._handleUserMessage({ content: fullPrompt, attachments: [] });
    });
    
    quickAsk.show(templates, context);
  }

  public async enhanceCurrentPrompt(): Promise<void> {
    if (!this._view) {
      return;
    }

    // Get current prompt from webview
    const currentPrompt = await new Promise<string>((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      const listener = this._view!.webview.onDidReceiveMessage((message) => {
        if (message.type === 'currentPrompt') {
          clearTimeout(timeout);
          listener.dispose();
          resolve(message.data);
        }
      });
      timeout = setTimeout(() => {
        listener.dispose();
        reject(new Error('Timeout waiting for current prompt'));
      }, 5000);

      this._view!.webview.postMessage({ type: 'getCurrentPrompt' });
    });

    if (!currentPrompt || !currentPrompt.trim()) {
      vscode.window.showWarningMessage('No prompt to enhance');
      return;
    }

    try {
      const enhanced = await this.invokePromptEnhancement(currentPrompt);
      this._view.webview.postMessage({
        type: 'enhancedPrompt',
        data: enhanced
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to enhance prompt: ${error.message}`);
    }
  }

  public async invokePromptEnhancement(original: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('denix-ai');
    const apiKey = config.get<string>('openRouterApiKey');
    const model = this._state.selectedModel;
    const maxTokens = config.get<number>('maxTokens', 500);

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const enhancementRequest = `You are a prompt engineer. Enhance this user prompt to be more specific and effective. Return only the enhanced prompt, no explanations.

Original: "${original}"

Make it:
1. More specific and detailed
2. Include relevant context
3. Break down into clear steps
4. Add any missing requirements`;

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
        messages: [
          { role: 'system', content: 'You are a prompt engineer. Return only the enhanced prompt, no explanations.' },
          { role: 'user', content: enhancementRequest }
        ],
        temperature: 0.7,
        max_tokens: Math.min(maxTokens, 500) // Cap at 500 for enhancement
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed: HTTP ${response.status}`;
      
      // Parse error response for better messages
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          if (response.status === 402) {
            errorMessage = `**Insufficient Credits**\n\n${errorData.error.message || 'You need more credits to make this request.'}\n\nAdd credits at https://openrouter.ai/settings/credits`;
          } else {
            errorMessage = errorData.error.message || errorMessage;
          }
        }
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json() as ChatResponse;
    const enhanced = data.choices?.[0]?.message?.content || original;
    return enhanced.trim();
  }

  public handleSelectionChanged(): void {
    this._updateContextAttachments();
  }

  public clearContextAttachments(): void {
    this._contextAttachments = [];
    this._dismissedContextIds.clear();
    this._updateWebviewState();
  }

  public createNewThread(): void {
    this._state.threadId = `thread-${Date.now()}`;
    this._state.messages = [];
    this._state.attachments = [];
    this._contextAttachments = [];
    this._dismissedContextIds.clear();
    this._saveState();
    this._updateWebviewState();
  }

  public async triggerFileAttach(): Promise<void> {
    await this._handleFileAttach({});
  }

  public async triggerImageAttach(): Promise<void> {
    await this._handleImageAttach({});
  }

  public toggleAutoMode(): void {
    this._state.autoMode = !this._state.autoMode;
    this._saveState();
    this._updateWebviewState();
  }

  /**
   * Get mention items (files, folders, docs, terminals, branches)
   */
  private async _getMentionItems(query: string = ''): Promise<Array<{ type: string; label: string; path?: string; icon?: string; category: string; extension?: string; hasSubmenu?: boolean }>> {
    const items: Array<{ type: string; label: string; path?: string; icon?: string; category: string; extension?: string; hasSubmenu?: boolean }> = [];
    const lowerQuery = query.toLowerCase();

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return items;
      }

      // Get COMMIT_EDITMSG (git commit message file)
      if (!query || 'commit'.includes(lowerQuery) || 'editmsg'.includes(lowerQuery)) {
        const gitDir = vscode.Uri.joinPath(workspaceFolder.uri, '.git');
        try {
          const commitEditMsg = vscode.Uri.joinPath(gitDir, 'COMMIT_EDITMSG');
          const stat = await vscode.workspace.fs.stat(commitEditMsg);
          if (stat.type === vscode.FileType.File) {
            items.push({
              type: 'file',
              label: 'COMMIT_EDITMSG',
              path: '.git/COMMIT_EDITMSG',
              icon: 'commit',
              category: 'Files & Folders',
              extension: ''
            });
          }
        } catch {
          // COMMIT_EDITMSG doesn't exist, skip
        }
      }

      // Get files and folders
      const filesAndFolders = await this._getFilesAndFolders(workspaceFolder.uri, lowerQuery);
      items.push(...filesAndFolders);

      // Get docs category (with submenu)
      if (!query || 'docs'.includes(lowerQuery) || 'doc'.includes(lowerQuery)) {
        items.push({
          type: 'docs',
          label: 'Docs',
          icon: 'docs',
          category: 'Docs',
          hasSubmenu: true
        });
      }

      // Get actual doc files (for submenu)
      const docs = await this._getDocs(workspaceFolder.uri, lowerQuery);
      items.push(...docs);

      // Get terminals (with submenu)
      if (!query || 'terminal'.includes(lowerQuery) || 'terminals'.includes(lowerQuery)) {
        items.push({
          type: 'terminal',
          label: 'Terminals',
          icon: 'terminal',
          category: 'Terminals',
          hasSubmenu: true
        });
      }

      // Get branches
      const branches = await this._getBranches(lowerQuery);
      items.push(...branches);

      // Get browser/workspace folders
      const folders = this._getWorkspaceFolders(lowerQuery);
      items.push(...folders);

    } catch (error) {
      console.error('Error fetching mention items:', error);
    }

    return items;
  }

  /**
   * Get files and folders from workspace
   */
  private async _getFilesAndFolders(rootUri: vscode.Uri, query: string): Promise<Array<{ type: string; label: string; path: string; icon: string; category: string; extension?: string; hasSubmenu?: boolean }>> {
    const items: Array<{ type: string; label: string; path: string; icon: string; category: string; extension?: string; hasSubmenu?: boolean }> = [];
    const maxItems = 20;

    try {
      const entries = await vscode.workspace.fs.readDirectory(rootUri);
      for (const [name, fileType] of entries.slice(0, maxItems)) {
        // Skip hidden files and common ignore patterns
        if (name.startsWith('.') && name !== '.denix') {
          continue;
        }

        const matches = !query || name.toLowerCase().includes(query);
        if (!matches) {
          continue;
        }

        const uri = vscode.Uri.joinPath(rootUri, name);
        const relativePath = vscode.workspace.asRelativePath(uri, false);

        if (fileType === vscode.FileType.File) {
          const ext = path.extname(name).slice(1).toLowerCase();
          const iconType = ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ? 'code' : 'file';
          items.push({
            type: 'file',
            label: name,
            path: relativePath,
            icon: iconType,
            category: 'Files & Folders',
            extension: ext
          });
        } else if (fileType === vscode.FileType.Directory) {
          items.push({
            type: 'folder',
            label: name,
            path: relativePath,
            icon: 'folder',
            category: 'Files & Folders',
            hasSubmenu: true
          });
        }
      }
    } catch (error) {
      console.error('Error reading files and folders:', error);
    }

    return items;
  }

  /**
   * Get documentation files (markdown)
   */
  private async _getDocs(rootUri: vscode.Uri, query: string): Promise<Array<{ type: string; label: string; path: string; icon: string; category: string }>> {
    const items: Array<{ type: string; label: string; path: string; icon: string; category: string }> = [];
    const maxItems = 10;

    try {
      const pattern = new vscode.RelativePattern(rootUri, '**/*.md');
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxItems);

      for (const file of files) {
        const name = path.basename(file.fsPath);
        const relativePath = vscode.workspace.asRelativePath(file, false);

        if (!query || name.toLowerCase().includes(query) || relativePath.toLowerCase().includes(query)) {
          items.push({
            type: 'doc',
            label: name,
            path: relativePath,
            icon: 'doc',
            category: 'Docs'
          });
        }
      }
    } catch (error) {
      console.error('Error reading docs:', error);
    }

    return items;
  }

  /**
   * Get terminals
   */
  private _getTerminals(query: string): Array<{ type: string; label: string; icon: string; category: string }> {
    const items: Array<{ type: string; label: string; icon: string; category: string }> = [];

    if (!query || 'terminal'.includes(query) || 'terminals'.includes(query)) {
      items.push({
        type: 'terminal',
        label: 'Terminals',
        icon: 'terminal',
        category: 'Terminals'
      });
    }

    return items;
  }

  /**
   * Get Git branches
   */
  private async _getBranches(query: string): Promise<Array<{ type: string; label: string; icon: string; category: string }>> {
    const items: Array<{ type: string; label: string; icon: string; category: string }> = [];

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return items;
      }

      // Try to get current branch using git command
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension && gitExtension.isActive) {
        const git = gitExtension.exports.getAPI(1);
        const repository = git.getRepository(workspaceFolder.uri);
        
        if (repository) {
          const currentBranch = repository.state.HEAD?.name;
          if (currentBranch) {
            if (!query || currentBranch.toLowerCase().includes(query) || 'branch'.includes(query)) {
              items.push({
                type: 'branch',
                label: `Branch (Diff with ${currentBranch})`,
                icon: 'branch',
                category: 'Branch (Diff with Main)'
              });
            }
          }
        }
      }
    } catch (error) {
      // Git extension not available or error
      console.error('Error getting branches:', error);
    }

    return items;
  }

  /**
   * Get workspace folders
   */
  private _getWorkspaceFolders(query: string): Array<{ type: string; label: string; icon: string; category: string }> {
    const items: Array<{ type: string; label: string; icon: string; category: string }> = [];
    const folders = vscode.workspace.workspaceFolders || [];

    if (!query || 'browser'.includes(query) || 'workspace'.includes(query)) {
      for (const folder of folders) {
        items.push({
          type: 'workspace',
          label: folder.name,
          icon: 'browser',
          category: 'Browser'
        });
      }
    }

    return items;
  }

  private async _handleImportRules(paths?: string[]): Promise<void> {
    try {
      let sourceUris: vscode.Uri[] | undefined;
      if (paths && paths.length > 0) {
        sourceUris = paths.map(p => vscode.Uri.file(p));
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          title: 'Import rule files',
          filters: { Markdown: ['md'] }
        });
        if (!picked) {
          return;
        }
        sourceUris = picked;
      }

      for (const uri of sourceUris) {
        try {
          const buffer = await vscode.workspace.fs.readFile(uri);
          const content = buffer.toString();
          const baseName = path.basename(uri.fsPath).replace(/\.md$/i, '');
          try {
            await this._rulesManager.createRuleFile(baseName, content);
          } catch {
            await this._rulesManager.createRuleFile(`${baseName}-${Date.now()}`, content);
          }
        } catch (error) {
          console.error('Failed to import rule file', error);
        }
      }

      const rules = await this._rulesManager.listRuleFiles();
      this._sendMessageToWebview({ type: 'rulesList', data: rules });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import rules: ${String(error)}`);
    }
  }

  public async selectModel(): Promise<void> {
    const model = await vscode.window.showQuickPick([
      { label: 'GPT-4o (Vision)', value: 'openai/gpt-4o' },
      { label: 'GPT-4 Turbo (Vision)', value: 'openai/gpt-4-turbo' },
      { label: 'GPT-4o Mini (Vision)', value: 'openai/gpt-4o-mini' },
      { label: 'Claude 3.5 Sonnet (Vision)', value: 'anthropic/claude-3.5-sonnet' },
      { label: 'Claude 3 Opus (Vision)', value: 'anthropic/claude-3-opus' },
      { label: 'Claude 3 Sonnet (Vision)', value: 'anthropic/claude-3-sonnet' },
      { label: 'Claude 3 Haiku (Vision)', value: 'anthropic/claude-3-haiku' },
      { label: 'GPT-4', value: 'openai/gpt-4' },
      { label: 'GPT-3.5 Turbo', value: 'openai/gpt-3.5-turbo' },
      { label: 'Mistral 7B', value: 'mistralai/mistral-7b-instruct' }
    ], {
      placeHolder: 'Select AI Model (Vision models support images)'
    });
    if (model) {
      this._state.selectedModel = model.value;
      this._saveState();
      this._updateWebviewState();
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }
}

