# Change Log

All notable changes to the "denix-ai" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

## [0.0.2] - 2024

### Fixed
- Fixed HTTP 401 "User not found" authentication errors by removing hardcoded API key
- Fixed "no response" issue by replacing showInformationMessage with output channel
- Clean up AI response markup tags (e.g., `<s>`, `[OUT]`, `</s>`, `[/OUT]`)

### Changed
- API key is now configurable through VS Code settings instead of being hardcoded
- AI responses now display in "Denix AI" output channel instead of notifications
- Improved error handling with detailed messages in output channel
- Added better progress reporting during AI requests
- Added proper configuration schema in package.json

### Added
- New setting: `denix-ai.openRouterApiKey` for secure API key storage
- User-friendly prompt to configure API key if missing
- Better error messages and debugging information
- Output channel for full AI response display
- Detailed logging for troubleshooting

## [0.0.1] - 2024

### Added
- Initial release
- AI-powered code explanation feature
- Integration with OpenRouter API