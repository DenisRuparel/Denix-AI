import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';
import { MemoriesManager } from './features/memories';
import { RulesManager } from './features/rules';
import { GuidelinesManager } from './features/guidelines';
import { SelectionWatcher } from './features/selection';
import { QuickQuestionService } from './features/askQuestion';
import { ContextManager } from './storage/contextManager';
import { MemoriesEditorProvider } from './ui/memoriesEditor';

/**
 * Extension activation function
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Denix - AI extension is now active!');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const memoriesManager = new MemoriesManager(workspaceRoot);
  const rulesManager = new RulesManager(workspaceRoot);
  const guidelinesManager = new GuidelinesManager(workspaceRoot);
  const selectionWatcher = new SelectionWatcher(workspaceRoot);
  const quickQuestionService = new QuickQuestionService();
  const contextManager = new ContextManager(
    memoriesManager,
    guidelinesManager,
    {
      listRuleFiles: () => rulesManager.listRuleFiles(),
      getRuleContent: (name: string) => rulesManager.getRuleContent(name)
    },
    () => selectionWatcher.getSelection()
  );

  // Create and register chat panel provider
  const provider = new ChatPanelProvider(
    context.extensionUri,
    context,
    memoriesManager,
    rulesManager,
    guidelinesManager,
    selectionWatcher,
    contextManager,
    quickQuestionService
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewType,
      provider
    )
  );

  // Register custom editor for memories
  const memoriesEditorProvider = new MemoriesEditorProvider(
    context.extensionUri,
    rulesManager,
    guidelinesManager
  );
  
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MemoriesEditorProvider.viewType,
      memoriesEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('denix-ai.newThread', () => provider.createNewThread()),
    vscode.commands.registerCommand('denix-ai.attachFile', () => provider.triggerFileAttach()),
    vscode.commands.registerCommand('denix-ai.attachImage', () => provider.triggerImageAttach()),
    vscode.commands.registerCommand('denix-ai.openMemories', () => provider.openMemories()),
    vscode.commands.registerCommand('denix-ai.openSettings', () => provider.openSettings()),
    vscode.commands.registerCommand('denix-ai.askQuestion', () => provider.openQuickAsk()),
    vscode.commands.registerCommand('denix-ai.enhancePrompt', () => provider.enhanceCurrentPrompt()),
    vscode.commands.registerCommand('denix-ai.clearContext', () => provider.clearContextAttachments()),
    vscode.commands.registerCommand('denix-ai.toggleAuto', () => provider.toggleAutoMode()),
    vscode.commands.registerCommand('denix-ai.changeModel', () => provider.selectModel())
  );

  // Selection watcher
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      selectionWatcher.updateFromEditor(event.textEditor);
      provider.handleSelectionChanged();
    })
  );

  // Update selection immediately if editor already open
  selectionWatcher.updateFromEditor(vscode.window.activeTextEditor);
}

/**
 * Extension deactivation function
 */
export function deactivate() {
  console.log('Denix - AI extension is now deactivated!');
}
