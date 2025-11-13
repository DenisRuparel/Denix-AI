(function() {
  'use strict';

  // Get VS Code API
  const vscode = acquireVsCodeApi();

  // State
  let state = {
    threadId: '',
    messages: [],
    attachments: [],
    selectedModel: 'anthropic/claude-3.5-sonnet',
    autoMode: true,
    activeTab: 'thread',
    currentFile: undefined
  };

  // DOM Elements
  const elements = {
    menuBtn: document.getElementById('menu-btn'),
    agentBtn: document.getElementById('agent-btn'),
    plusBtn: document.getElementById('plus-btn'),
    tabThread: document.getElementById('tab-thread'),
    tabTasks: document.getElementById('tab-tasks'),
    tabEdits: document.getElementById('tab-edits'),
    content: document.getElementById('content'),
    welcomeCard: document.getElementById('welcome-card'),
    messages: document.getElementById('messages'),
    contextPills: document.getElementById('context-pills'),
    messageInput: document.getElementById('message-input'),
    mentionBtn: document.getElementById('mention-btn'),
    trashBtn: document.getElementById('trash-btn'),
    copyBtn: document.getElementById('copy-btn'),
    formatTextBtn: document.getElementById('format-text-btn'),
    autoBtn: document.getElementById('auto-btn'),
    formatBtn: document.getElementById('format-btn'),
    modelBtn: document.getElementById('model-btn'),
    attachBtn: document.getElementById('attach-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    sendBtn: document.getElementById('send-btn'),
    imageModal: document.getElementById('image-modal'),
    imageModalImg: document.getElementById('image-modal-img'),
    imageModalClose: document.getElementById('image-modal-close')
  };

  // Initialize
  function init() {
    setupEventListeners();
    setupTextareaAutoResize();
    sendMessage({ type: 'initialize' });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Header buttons
    elements.menuBtn?.addEventListener('click', () => {
      showContextMenu();
    });

    elements.agentBtn?.addEventListener('click', () => {
      showAgentSelector();
    });

    elements.plusBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'newThread' } });
    });

    // Tab navigation
    elements.tabThread?.addEventListener('click', () => switchTab('thread'));
    elements.tabTasks?.addEventListener('click', () => switchTab('tasks'));
    elements.tabEdits?.addEventListener('click', () => switchTab('edits'));

    // Top row quick actions
    elements.mentionBtn?.addEventListener('click', () => {
      showMentionPicker();
    });

    elements.trashBtn?.addEventListener('click', () => {
      clearAllAttachments();
    });

    elements.copyBtn?.addEventListener('click', () => {
      copyLastMessage();
    });

    elements.formatTextBtn?.addEventListener('click', () => {
      showFormatTextOptions();
    });

    // Bottom row actions
    elements.autoBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'toggleAuto' } });
    });

    elements.formatBtn?.addEventListener('click', () => {
      showFormatOptions();
    });

    elements.modelBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'selectModel' } });
    });

    elements.attachBtn?.addEventListener('click', () => {
      sendMessage({ type: 'fileAttach', data: {} });
    });

    elements.settingsBtn?.addEventListener('click', () => {
      showSettings();
    });

    elements.sendBtn?.addEventListener('click', () => {
      sendUserMessage();
    });

    // Message input handlers
    elements.messageInput?.addEventListener('input', () => {
      updateSendButtonState();
      // Auto-resize handled in setupTextareaAutoResize
    });

    elements.messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!elements.sendBtn?.disabled) {
          sendUserMessage();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        clearAllAttachments();
      } else if (e.key === 'Escape') {
        elements.messageInput?.blur();
      }
    });

    elements.messageInput?.addEventListener('paste', (event) => {
      handlePaste(event);
    });

    // Image modal
    elements.imageModalClose?.addEventListener('click', () => {
      closeImageModal();
    });

    elements.imageModal?.addEventListener('click', (e) => {
      if (e.target === elements.imageModal) {
        closeImageModal();
      }
    });

    // Listen for messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      handleMessage(message);
    });
  }

  // Setup textarea auto-resize and resizable functionality
  function setupTextareaAutoResize() {
    const textarea = elements.messageInput;
    if (!textarea) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // Auto-resize on input
    textarea.addEventListener('input', () => {
      if (!isResizing) {
        textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 200);
        textarea.style.height = newHeight + 'px';
      }
    });

    // Make textarea resizable by dragging from bottom-right corner
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'textarea-resize-handle';
    resizeHandle.innerHTML = '⋰';
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      color: var(--text-secondary);
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.5;
      transition: opacity 0.2s;
      z-index: 10;
      user-select: none;
    `;

    const inputCenter = textarea.parentElement;
    if (inputCenter) {
      inputCenter.style.position = 'relative';
      inputCenter.appendChild(resizeHandle);

      resizeHandle.addEventListener('mouseenter', () => {
        resizeHandle.style.opacity = '1';
      });

      resizeHandle.addEventListener('mouseleave', () => {
        if (!isResizing) {
          resizeHandle.style.opacity = '0.5';
        }
      });

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startHeight = textarea.offsetHeight;
        resizeHandle.style.opacity = '1';
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (isResizing) {
          const diff = e.clientY - startY;
          const newHeight = Math.min(Math.max(startHeight + diff, 40), 200);
          textarea.style.height = newHeight + 'px';
        }
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          resizeHandle.style.opacity = '0.5';
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
  }

  // Handle messages from extension
  function handleMessage(message) {
    switch (message.type) {
      case 'updateState':
        updateState(message.data);
        break;
      case 'typingIndicator':
        showTypingIndicator(message.data.active);
        break;
      case 'previewImage':
        showImageModal(message.data.src);
        break;
      case 'error':
        showError(message.data.message);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Update state and UI
  function updateState(newState) {
    state = { ...state, ...newState };
    renderMessages();
    renderAttachments();
    updateUI();
  }

  // Render messages
  function renderMessages() {
    if (!elements.messages || !elements.welcomeCard) return;

    if (state.messages.length === 0) {
      elements.welcomeCard.style.display = 'block';
      elements.messages.innerHTML = '';
      return;
    }

    elements.welcomeCard.style.display = 'none';
    elements.messages.innerHTML = '';

    state.messages.forEach((msg) => {
      const messageEl = createMessageElement(msg);
      elements.messages.appendChild(messageEl);
    });

    // Scroll to bottom
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  // Create message element
  function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${msg.role}`;
    messageDiv.setAttribute('data-id', msg.id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (msg.role === 'user') {
      contentDiv.textContent = msg.content;
    } else {
      // Render markdown for assistant messages
      contentDiv.innerHTML = renderMarkdown(msg.content);
    }

    messageDiv.appendChild(contentDiv);
    return messageDiv;
  }

  // Simple markdown renderer
  function renderMarkdown(text) {
    // Escape HTML first
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const escapedCode = escapeHtml(code);
      return `<pre><code class="language-${lang || 'text'}">${escapedCode}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Render attachments as pills
  function renderAttachments() {
    if (!elements.contextPills) return;

    elements.contextPills.innerHTML = '';

    state.attachments.forEach((att, index) => {
      const pill = createAttachmentPill(att, index);
      elements.contextPills.appendChild(pill);
    });

    // Add current file if available and not already attached
    if (state.currentFile && !state.attachments.some(a => a.path === state.currentFile)) {
      const fileName = state.currentFile.split(/[/\\]/).pop();
      const currentFilePill = createCurrentFilePill(fileName, state.currentFile);
      elements.contextPills.appendChild(currentFilePill);
    }

    // Update send button state after rendering
    updateSendButtonState();
  }

  // Create attachment pill
  function createAttachmentPill(att, index) {
    const pill = document.createElement('div');
    pill.className = 'context-pill';
    pill.setAttribute('data-index', index);

    if (att.type === 'file') {
      pill.innerHTML = `
        <span class="pill-icon">📄</span>
        <span class="pill-name" title="${att.name}">${truncate(att.name, 20)}</span>
        <button class="pill-remove" data-index="${index}" aria-label="Remove ${att.name}">×</button>
      `;
    } else if (att.type === 'image') {
      // Ensure we have the image data
      const imageSrc = att.thumbnail || att.content || '';
      
      pill.innerHTML = `
        <img class="pill-thumbnail" src="${imageSrc}" alt="${att.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
        <span class="pill-icon" style="display: none;">🖼️</span>
        <span class="pill-name" title="${att.name}">${truncate(att.name, 15)}</span>
        <button class="pill-remove" data-index="${index}" aria-label="Remove ${att.name}">×</button>
      `;
      pill.classList.add('pill-image');

      // Click to preview
      const thumbnail = pill.querySelector('.pill-thumbnail');
      if (thumbnail && imageSrc) {
        thumbnail.addEventListener('click', (e) => {
          e.stopPropagation();
          sendMessage({ type: 'previewImage', data: { src: att.content || imageSrc } });
        });
        
        // Handle image load error
        thumbnail.addEventListener('error', () => {
          const icon = pill.querySelector('.pill-icon');
          if (icon) icon.style.display = 'inline';
        });
      }
    }

    // Remove button
    const removeBtn = pill.querySelector('.pill-remove');
    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Add fade-out animation
      pill.classList.add('removing');
      setTimeout(() => {
        sendMessage({ type: 'removeAttachment', data: { index } });
      }, 150);
    });

    return pill;
  }

  // Create current file pill
  function createCurrentFilePill(fileName, filePath) {
    const pill = document.createElement('div');
    pill.className = 'context-pill context-pill-current';
    pill.innerHTML = `
      <span class="pill-icon">📄</span>
      <span class="pill-name" title="${filePath}">${truncate(fileName, 20)}</span>
      <button class="pill-remove" data-action="remove-current">×</button>
    `;

    const removeBtn = pill.querySelector('.pill-remove');
    removeBtn?.addEventListener('click', () => {
      // Just hide, don't actually remove from state
      pill.style.display = 'none';
    });

    return pill;
  }

  // Truncate text
  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // Update UI based on state
  function updateUI() {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    const activeTab = document.getElementById(`tab-${state.activeTab}`);
    activeTab?.classList.add('active');

    // Update auto button
    if (elements.autoBtn) {
      const indicator = elements.autoBtn.querySelector('.toggle-indicator');
      if (state.autoMode) {
        elements.autoBtn.classList.add('active');
        if (indicator) indicator.textContent = '◉';
      } else {
        elements.autoBtn.classList.remove('active');
        if (indicator) indicator.textContent = '○';
      }
    }

    // Update model button
    if (elements.modelBtn) {
      const modelNameEl = elements.modelBtn.querySelector('.model-name');
      if (modelNameEl) {
        const modelName = state.selectedModel.split('/').pop() || 'Claude';
        const shortName = modelName.length > 8 ? modelName.substring(0, 8) + '...' : modelName;
        modelNameEl.textContent = shortName;
      }
    }

    // Update send button state
    updateSendButtonState();
  }

  // Switch tab
  function switchTab(tab) {
    state.activeTab = tab;
    sendMessage({ type: 'command', data: { command: 'changeTab', payload: { tab } } });
    updateUI();
  }

  // Update send button state
  function updateSendButtonState() {
    const input = elements.messageInput;
    const sendBtn = elements.sendBtn;
    if (!input || !sendBtn) return;

    const hasContent = input.value.trim().length > 0;
    const hasAttachments = state.attachments.length > 0;

    if (hasContent || hasAttachments) {
      sendBtn.disabled = false;
    } else {
      sendBtn.disabled = true;
    }
  }

  // Send user message
  function sendUserMessage() {
    const input = elements.messageInput;
    if (!input) return;

    const content = input.value.trim();
    if (!content && state.attachments.length === 0) {
      return;
    }

    sendMessage({
      type: 'userMessage',
      data: {
        content,
        attachments: [...state.attachments]
      }
    });

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    updateSendButtonState();
  }

  // Clear all attachments
  function clearAllAttachments() {
    if (state.attachments.length === 0) return;

    state.attachments = [];
    renderAttachments();
    updateSendButtonState();
    sendMessage({ type: 'command', data: { command: 'clearAttachments' } });
    showToast('All attachments cleared', 'success');
  }

  // Show format text options
  function showFormatTextOptions() {
    // Placeholder - would show text formatting menu
    console.log('Show format text options');
    showToast('Format text options', 'info');
  }

  // Show settings
  function showSettings() {
    // Placeholder - would show settings menu
    console.log('Show settings');
    showToast('Settings', 'info');
  }

  // Show typing indicator
  function showTypingIndicator(active) {
    if (!elements.messages) return;

    let indicator = document.getElementById('typing-indicator');
    
    if (active && !indicator) {
      indicator = document.createElement('div');
      indicator.id = 'typing-indicator';
      indicator.className = 'typing-indicator';
      indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
      elements.messages.appendChild(indicator);
      elements.messages.scrollTop = elements.messages.scrollHeight;
    } else if (!active && indicator) {
      indicator.remove();
    }
  }

  // Show image modal
  function showImageModal(src) {
    if (elements.imageModal && elements.imageModalImg) {
      elements.imageModalImg.src = src;
      elements.imageModal.style.display = 'flex';
    }
  }

  // Close image modal
  function closeImageModal() {
    if (elements.imageModal) {
      elements.imageModal.style.display = 'none';
    }
  }

  // Show context menu
  function showContextMenu() {
    // Placeholder - would show context menu
    console.log('Show context menu');
  }

  // Show agent selector
  function showAgentSelector() {
    // Placeholder - would show agent selector
    console.log('Show agent selector');
  }

  // Show mention picker
  function showMentionPicker() {
    // Placeholder - would show file/symbol picker
    console.log('Show mention picker');
  }

  // Copy last message
  function copyLastMessage() {
    if (state.messages.length > 0) {
      const lastMsg = state.messages[state.messages.length - 1];
      navigator.clipboard.writeText(lastMsg.content).then(() => {
        // Show toast notification
        showToast('Copied to clipboard');
      });
    }
  }

  // Show format options
  function showFormatOptions() {
    // Placeholder - would show format options
    console.log('Show format options');
  }

  // Show more options
  function showMoreOptions() {
    // Placeholder - would show more options
    console.log('Show more options');
  }

  // Show error
  function showError(message) {
    showToast(message, 'error');
  }

  // Show toast notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Handle paste events for images
  function handlePaste(event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) {
      return;
    }

    const items = clipboardData.items;
    if (!items) {
      return;
    }

    let handledImage = false;

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) {
          handledImage = true;
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result;
            if (typeof base64 === 'string') {
              const extension = file.type.split('/')[1] || 'png';
              const name = file.name || `pasted-image.${extension}`;
              sendMessage({
                type: 'imageAttach',
                data: { base64, name }
              });
              showToast('Image attached', 'success');
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (handledImage) {
      event.preventDefault();
    }
  }

  // Send message to extension
  function sendMessage(message) {
    vscode.postMessage(message);
  }

  // Initialize on load
  init();
  
  // Initial send button state
  updateSendButtonState();
})();

