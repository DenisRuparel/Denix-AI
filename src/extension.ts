import * as vscode from 'vscode';

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

    // Get API key and model from settings
    const config = vscode.workspace.getConfiguration('denix-ai');
    const apiKey = config.get<string>('openRouterApiKey');
    const model = config.get<string>('model', 'mistralai/mistral-7b-instruct');

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
        // Check if fetch is available
        if (typeof fetch === 'undefined') {
          throw new Error('fetch API is not available. Please update VS Code to a newer version.');
        }

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
            model: model,
            messages: [
              { 
                role: 'system', 
                content: 'You are an expert code explainer. Your task is to explain code clearly and thoroughly. Always provide detailed explanations that help developers understand what the code does, how it works, and why it\'s written that way.' 
              },
              { 
                role: 'user', 
                content: `Explain the following code in detail. Describe what it does, how it works, and any important concepts:\n\n${selectedText}` 
              }
            ],
            temperature: 0.7,
            max_tokens: 1500
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
        
        // Get the raw response text first for debugging
        const responseText = await response.text();
        
        let data: ChatResponse;
        try {
          data = JSON.parse(responseText) as ChatResponse;
        } catch (parseError: any) {
          const errorMsg = `Failed to parse API response: ${parseError?.message || parseError}`;
          outputChannel.clear();
          outputChannel.appendLine('=== Error: Failed to Parse API Response ===');
          outputChannel.appendLine(errorMsg);
          outputChannel.appendLine('\n=== Raw Response ===');
          outputChannel.appendLine(responseText);
          outputChannel.show(true);
          vscode.window.showErrorMessage('Failed to parse AI response. Check output channel for details.');
          return;
        }

        // Check for API errors first
        if (data.error) {
          const errorMsg = `API Error: ${data.error.message || data.error.type || 'Unknown error'}`;
          outputChannel.clear();
          outputChannel.appendLine('=== API Error ===');
          outputChannel.appendLine(errorMsg);
          outputChannel.appendLine('\n=== Full Error Response ===');
          outputChannel.appendLine(JSON.stringify(data, null, 2));
          outputChannel.show(true);
          vscode.window.showErrorMessage(errorMsg);
          return;
        }

        // Try to extract content from different possible response structures
        let rawOutput = '';
        let originalContent = '';
        
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          // Try message.content first (standard format)
          if (choice.message?.content !== undefined) {
            originalContent = choice.message.content;
            rawOutput = originalContent.trim();
          }
          // Try delta.content (streaming format)
          else if (choice.delta?.content !== undefined) {
            originalContent = choice.delta.content;
            rawOutput = originalContent.trim();
          }
          // Try to access content directly if structure is different
          else if ((choice as any).text !== undefined) {
            originalContent = String((choice as any).text);
            rawOutput = originalContent.trim();
          }
        }
        
        // Check if content is empty or only whitespace
        if (!rawOutput || rawOutput.length === 0) {
          const noResponseMsg = 'AI returned empty or whitespace-only response. The model may be having issues.';
          outputChannel.clear();
          outputChannel.appendLine('=== Error: No Valid Response from AI ===');
          outputChannel.appendLine('The API returned a response, but the content is empty or contains only whitespace.');
          outputChannel.appendLine('\nPossible causes:');
          outputChannel.appendLine('1. The AI model may be experiencing issues or rate limiting');
          outputChannel.appendLine('2. The selected code may be too complex or too simple');
          outputChannel.appendLine('3. The model may need different parameters');
          outputChannel.appendLine('\n=== Response Details ===');
          outputChannel.appendLine('Model: ' + (data.model || 'Unknown'));
          outputChannel.appendLine('Finish reason: ' + (data.choices?.[0]?.finish_reason || 'Unknown'));
          if (data.usage) {
            outputChannel.appendLine('Completion tokens: ' + (data.usage.completion_tokens || 0));
            outputChannel.appendLine('Total tokens: ' + (data.usage.total_tokens || 0));
          }
          outputChannel.appendLine('\nRaw content (before trim): ' + JSON.stringify(originalContent));
          outputChannel.appendLine('Content length: ' + originalContent.length);
          outputChannel.appendLine('\n=== Full Response ===');
          outputChannel.appendLine(JSON.stringify(data, null, 2));
          outputChannel.show(true);
          
          // Suggest retrying with a different approach
          const action = await vscode.window.showWarningMessage(
            noResponseMsg + ' Would you like to try again?',
            'Retry',
            'Dismiss'
          );
          
          if (action === 'Retry') {
            // Retry the command
            vscode.commands.executeCommand('ai-assistant.explainCode');
          }
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
