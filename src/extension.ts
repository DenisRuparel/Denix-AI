import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';

/**
 * Extension activation function
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Denix - AI extension is now active!');

  // Create and register chat panel provider
  const provider = new ChatPanelProvider(context.extensionUri, context);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewType,
      provider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('denix-ai.newThread', () => {
      vscode.commands.executeCommand('denix-ai-chat.focus');
    }),
    vscode.commands.registerCommand('denix-ai.attachFile', () => {
      vscode.commands.executeCommand('denix-ai-chat.focus');
    }),
    vscode.commands.registerCommand('denix-ai.attachImage', () => {
      vscode.commands.executeCommand('denix-ai-chat.focus');
    })
  );
}

/**
 * Extension deactivation function
 */
export function deactivate() {
  console.log('Denix - AI extension is now deactivated!');
}
