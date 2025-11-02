import * as vscode from 'vscode';

interface ChatResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('ai-assistant.explainCode', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor.');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
      vscode.window.showInformationMessage('Please select some code first.');
      return;
    }

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "AI is analyzing your code...",
      cancellable: false
    }, async () => {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer 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`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/DenisRuparel/Denix-AI', // optional but good practice
            'X-Title': 'Denix AI Assistant', // optional label
          },
          body: JSON.stringify({
            model: 'mistralai/mistral-7b-instruct', // or any other OpenRouter model
            messages: [
              { role: 'system', content: 'You are a helpful AI code assistant.' },
              { role: 'user', content: `Explain what this code does:\n${selectedText}` }
            ]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          vscode.window.showErrorMessage(`AI request failed: HTTP ${response.status} - ${errorText}`);
          return;
        }

        // ✅ Explicitly cast the response JSON
        const data = (await response.json()) as ChatResponse;

        const output = data.choices?.[0]?.message?.content?.trim() || 'No response.';
        vscode.window.showInformationMessage(output);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message || error}`);
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
