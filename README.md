# Denix AI

An AI-powered VS Code extension that helps you understand code instantly. Select any code in your editor and get instant explanations powered by AI.

## Features

* 🤖 **AI-Powered Code Explanation**: Select any code and get instant explanations
* ⚡ **Fast & Efficient**: Get insights in seconds
* 🔒 **Secure**: Your API key is stored securely in VS Code settings
* 🌐 **Powered by OpenRouter**: Access to multiple AI models through one API

## Getting Started

### 1. Install the Extension

Install from the VS Code marketplace or build from source.

### 2. Get Your OpenRouter API Key

1. Visit [openrouter.ai/keys](https://openrouter.ai/keys)
2. Sign up for a free account
3. Create a new API key
4. Copy the API key

### 3. Configure the Extension

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "denix-ai"
3. Enter your OpenRouter API key in the `Denix AI: Openrouter Api Key` setting

Alternatively, you can edit your `settings.json` directly:

```json
{
  "denix-ai.openRouterApiKey": "your-api-key-here"
}
```

### 4. Use the Extension

1. Select any code in your editor
2. Run the command **"AI: Explain Selected Code"** from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Wait for the AI to analyze your code
4. The explanation will appear in the **"Denix AI"** output channel at the bottom of VS Code
5. You'll get a notification when the explanation is ready

## Extension Settings

This extension contributes the following settings:

* `denix-ai.openRouterApiKey`: Your OpenRouter API key (required). Get one at [openrouter.ai/keys](https://openrouter.ai/keys)

## Requirements

* VS Code version 1.105.0 or higher
* An OpenRouter API key (free tier available)

## Known Issues

None at the moment. If you encounter any issues, please report them on the [GitHub repository](https://github.com/DenisRuparel/Denix-AI).

## Release Notes

### 0.0.2

* ✅ Fixed HTTP 401 authentication errors
* ✅ Added secure API key configuration via VS Code settings
* ✅ Improved error handling and user guidance
* ✅ Updated documentation with setup instructions

### 0.0.1

Initial release of Denix AI with basic code explanation feature.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
