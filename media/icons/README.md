# Icons Directory

This directory contains icons for the chat panel. You can use either PNG, JPEG, or SVG icons.

## Supported Formats
- PNG (`.png`) - Recommended for best quality
- JPEG (`.jpg` or `.jpeg`) - Alternative image format
- SVG (`.svg`) - Vector format, fallback if image not found

## Chat Panel Icon Names

### Header Icons
- `menu.png` - Hamburger menu button
- `add.png` - Add/plus button
- `more.png` - More options menu
- `back.png` - Back button
- `refresh.png` - Refresh button
- `close.png` - Close/clear button

### Quick Actions (Top Row)
- `mention.png` - Mention/@ button
- `memory.png` - Memories button
- `ask-question.png` - Ask question button
- `selected-text.png` - Selected text button

### Action Buttons (Bottom Row)
- `enhance-prompt.png` - Enhance prompt button (star/sparkle icon)
- `attach.png` - Attach file button (angle brackets icon)
- `send.png` - Send message button (arrow icon)
- `stop.png` - Stop generation button
- `robot.png` - Model/robot icon (for model selector)

### Tab Icons
- `thread.png` - Thread tab icon
- `tasks.png` - Tasks tab icon
- `edits.png` - Edits tab icon

### Mention Picker Icons
- `context.png` - Default context icon
- `target.png` - Focus context icon
- `memories.png` - Memories icon
- `rules.png` - Rules icon
- `selection.png` - Selection icon
- `file.png` - Generic file icon
- `folder.png` - Folder icon
- `terminal.png` - Terminal icon
- `browser.png` - Browser icon
- `branch.png` - Git branch icon
- `ts.png` - TypeScript file icon
- `js.png` - JavaScript file icon
- `git.png` - Git icon

## How It Works

The system will:
1. First try to load a PNG icon from this directory
2. If PNG fails to load, automatically fall back to the SVG icon
3. If no image is found, use the built-in SVG icon

## Adding Custom Icons

1. Place your icon file (PNG/JPEG) in this directory
2. Name it exactly as listed above (e.g., `mention.png`, `send.png`)
3. Recommended size: 
   - Small icons (buttons): 16x16 to 18x18 pixels
   - Medium icons: 20x20 pixels
   - Large icons: 24x24 pixels
4. The icon will automatically be used when available
5. Icons should have transparent backgrounds for best appearance

## Example

To replace the send button icon:
1. Create or find a PNG image of your send icon
2. Save it as `send.png` in this directory
3. The icon will automatically replace the SVG icon on next load

