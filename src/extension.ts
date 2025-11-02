import * as vscode from 'vscode';

interface ChatResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

function cleanAIResponse(text: string): string {
  // Remove common AI markup tags that models sometimes add
  let cleaned = text
    // Remove <s> and </s> tags
    .replace(/<s>\s*/g, '')
    .replace(/\s*<\/s>/g, '')
    // Remove [OUT] and [/OUT] tags
    .replace(/\[OUT\]\s*/g, '')
    .replace(/\s*\[\/OUT\]/g, '')
    // Remove any other common output tags
    .replace(/<\|im_start\|>\s*/g, '')
    .replace(/\s*<\|im_end\|>/g, '');
  
  return cleaned.trim();
}

export function activate(context: vscode.ExtensionContext) {
  // Create an output channel for AI responses
  const outputChannel = vscode.window.createOutputChannel('Denix AI');
  context.subscriptions.push(outputChannel);

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

    // Get API key from settings
    const config = vscode.workspace.getConfiguration('denix-ai');
    const apiKey = config.get<string>('openRouterApiKey');

    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        'OpenRouter API key not configured. Please set it in settings.',
        'Open Settings'
      );
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'denix-ai.openRouterApiKey');
      }
      return;
    }

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "AI is analyzing your code...",
      cancellable: false
    }, async (progress) => {
      try {
        progress.report({ message: "Sending request to AI..." });
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/DenisRuparel/Denix-AI',
            'X-Title': 'Denix AI Assistant',
          },
          body: JSON.stringify({
            model: 'mistralai/mistral-7b-instruct',
            messages: [
              { role: 'system', content: 'You are a helpful AI code assistant.' },
              { role: 'user', content: `Explain what this code does:\n${selectedText}` }
            ]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorMessage = `AI request failed: HTTP ${response.status} - ${errorText}`;
          outputChannel.appendLine(errorMessage);
          outputChannel.show(true);
          vscode.window.showErrorMessage(`AI request failed: HTTP ${response.status}`);
          return;
        }

        progress.report({ message: "Processing AI response..." });
        
        // ✅ Explicitly cast the response JSON
        const data = (await response.json()) as ChatResponse;

        const rawOutput = data.choices?.[0]?.message?.content?.trim();
        
        if (!rawOutput) {
          const noResponseMsg = 'No response from AI. Check the output channel for details.';
          outputChannel.appendLine('AI returned empty response. Full response:');
          outputChannel.appendLine(JSON.stringify(data, null, 2));
          outputChannel.show(true);
          vscode.window.showWarningMessage(noResponseMsg);
          return;
        }

        // Clean up any markup tags from the AI response
        const output = cleanAIResponse(rawOutput);

        // Display in output channel and show notification
        outputChannel.clear();
        outputChannel.appendLine('=== AI Code Explanation ===\n');
        outputChannel.appendLine(output);
        outputChannel.show(true);
        vscode.window.showInformationMessage('AI explanation ready! Check the "Denix AI" output channel.', 'View Explanation');
        
      } catch (error: any) {
        const errorMessage = `Error: ${error.message || error}`;
        outputChannel.appendLine(errorMessage);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Error: ${error.message || error}`);
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
