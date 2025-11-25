(function() {
  'use strict';

  // Get VS Code API
  const vscode = acquireVsCodeApi();

  // State
  let state = {
    threadId: '',
    threadTitle: 'denix-ai',
    messages: [],
    attachments: [],
    selectedModel: 'anthropic/claude-3.5-sonnet',
    autoMode: true,
    activeTab: 'thread',
    currentFile: undefined,
    isGenerating: false
  };

  // DOM Elements
  const elements = {
    hamburgerBtn: document.getElementById('hamburger-btn'),
    projectTitle: document.getElementById('project-title'),
    menuBtn: document.getElementById('menu-btn'),
    dropdownMenu: document.getElementById('dropdown-menu'),
    menuSettings: document.getElementById('menu-settings'),
    menuHelp: document.getElementById('menu-help'),
    plusBtn: document.getElementById('plus-btn'),
    tabThread: document.getElementById('tab-thread'),
    tabTasks: document.getElementById('tab-tasks'),
    tabEdits: document.getElementById('tab-edits'),
    tasksCounter: document.getElementById('tasks-counter'),
    threadsPanel: document.getElementById('threads-panel'),
    backBtn: document.getElementById('back-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    addThreadBtn: document.getElementById('add-thread-btn'),
    searchThreadsInput: document.getElementById('search-threads-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    threadsContent: document.getElementById('threads-content'),
    content: document.getElementById('content'),
    welcomeCard: document.getElementById('welcome-card'),
    messages: document.getElementById('messages'),
    contextPills: document.getElementById('context-pills'),
    messageInput: document.getElementById('message-input'),
    mentionBtn: document.getElementById('mention-btn'),
    mentionPicker: document.getElementById('mention-picker'),
    mentionSearchInput: document.getElementById('mention-search-input'),
    mentionSuggestions: document.getElementById('mention-suggestions'),
    memoriesBtn: document.getElementById('memories-btn'),
    selectionBtn: document.getElementById('selection-btn'),
    autoBtn: document.getElementById('auto-btn'),
    askQuestionBtn: document.getElementById('ask-question-btn'),
    enhanceBtn: document.getElementById('enhance-btn'),
    modelBtn: document.getElementById('model-btn'),
    attachBtn: document.getElementById('attach-btn'),
    sendBtn: document.getElementById('send-btn'),
    stopBtn: document.getElementById('stop-btn'),
    imageModal: document.getElementById('image-modal'),
    imageModalImg: document.getElementById('image-modal-img'),
    imageModalClose: document.getElementById('image-modal-close')
  };

  // Mention picker state
  const quickMentionItems = [
    {
      id: 'default-context',
      label: 'Default Context',
      description: 'Let Denix manage memories, rules, and selection automatically',
      group: 'Quick Actions',
      action: 'insert',
      token: '@default-context',
      icon: 'context'
    },
    {
      id: 'focus-context',
      label: 'Focus Context',
      description: 'Restrict to the files and selection you pin',
      group: 'Quick Actions',
      action: 'insert',
      token: '@focus-context',
      icon: 'target'
    },
    {
      id: 'clear-context',
      label: 'Clear Context',
      description: 'Remove all auto-attached context for this reply',
      group: 'Quick Actions',
      action: 'command',
      command: 'clearContext'
    },
    {
      id: 'denix-memories',
      label: 'Denix memories',
      description: 'Open workspace memories panel',
      group: 'Knowledge Spaces',
      action: 'panel',
      panel: 'memories',
      icon: 'memories'
    },
    {
      id: 'rules-guidelines',
      label: 'Rules & guidelines',
      description: 'Edit workspace rules and user guidelines',
      group: 'Knowledge Spaces',
      action: 'panel',
      panel: 'rules',
      icon: 'rules'
    },
    {
      id: 'selected-text',
      label: 'Use selected text',
      description: 'Insert the currently selected code or content',
      group: 'Knowledge Spaces',
      action: 'selection',
      icon: 'selection'
    }
  ];

  let workspaceMentionItems = [];
  let mentionItems = [];
  let selectedMentionIndex = -1;
  let mentionSearchTerm = '';

  // Panel state
  let currentSelectionContext = null;

  // Initialize
  function init() {
    setupEventListeners();
    setupTextareaAutoResize();
    sendMessage({ type: 'initialize' });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Header buttons
    elements.hamburgerBtn?.addEventListener('click', () => {
      toggleThreadsPanel();
    });

    elements.menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdownMenu();
    });

    // Dropdown menu items
    elements.menuSettings?.addEventListener('click', () => {
      hideDropdownMenu();
      sendMessage({ type: 'command', data: { command: 'openSettings' } });
    });

    elements.menuHelp?.addEventListener('click', () => {
      hideDropdownMenu();
      sendMessage({ type: 'command', data: { command: 'openHelp' } });
    });

    elements.plusBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'newThread' } });
    });

    // Double-click on title to rename
    elements.projectTitle?.addEventListener('dblclick', () => {
      enableTitleEditing();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (elements.dropdownMenu && !elements.dropdownMenu.contains(e.target) && e.target !== elements.menuBtn) {
        hideDropdownMenu();
      }
    });

    // Threads panel
    elements.backBtn?.addEventListener('click', () => {
      hideThreadsPanel();
    });

    elements.refreshBtn?.addEventListener('click', () => {
      loadThreadHistory();
    });

    elements.addThreadBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'newThread' } });
      hideThreadsPanel();
    });

    // Thread search
    elements.searchThreadsInput?.addEventListener('input', (e) => {
      handleThreadSearch(e.target.value);
    });

    elements.clearSearchBtn?.addEventListener('click', () => {
      if (elements.searchThreadsInput) {
        elements.searchThreadsInput.value = '';
        handleThreadSearch('');
      }
    });

    // Tab navigation
    elements.tabThread?.addEventListener('click', () => switchTab('thread'));
    elements.tabTasks?.addEventListener('click', () => switchTab('tasks'));
    elements.tabEdits?.addEventListener('click', () => switchTab('edits'));

    // Top row quick actions
    elements.mentionBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMentionPicker();
    });

    elements.mentionBtn?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        showMentionPicker(true);
      }
    });

    // Mention picker search
    elements.mentionSearchInput?.addEventListener('input', (e) => {
      handleMentionSearch(e.target.value);
    });

    elements.mentionSearchInput?.addEventListener('keydown', (e) => {
      handleMentionKeydown(e);
    });

    // Close mention picker when clicking outside
    document.addEventListener('click', (e) => {
      if (elements.mentionPicker && !elements.mentionPicker.contains(e.target) && e.target !== elements.mentionBtn) {
        hideMentionPicker();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.mentionPicker?.classList.contains('show')) {
        hideMentionPicker(true);
      }
    });

    elements.memoriesBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'openMemories' } });
    });

    // Show tooltip on hover, hide when mouse leaves button or tooltip
    // Selection button - no tooltip, just toggle selection context
    elements.selectionBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'toggleSelection' } });
    });



    // Bottom row actions
    elements.autoBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'toggleAuto' } });
    });

    elements.askQuestionBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'askQuestion' } });
    });

    elements.enhanceBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'enhancePrompt' } });
    });

    elements.modelBtn?.addEventListener('click', () => {
      sendMessage({ type: 'command', data: { command: 'selectModel' } });
    });

    elements.attachBtn?.addEventListener('click', () => {
      sendMessage({ type: 'fileAttach', data: {} });
    });

    elements.sendBtn?.addEventListener('click', () => {
      sendUserMessage();
    });

    elements.stopBtn?.addEventListener('click', () => {
      stopGeneration();
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
      } else if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTimeout(() => showMentionPicker(false), 0);
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

    // Auto-resize on input
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 200);
      textarea.style.height = newHeight + 'px';
    });
  }

  // Handle messages from extension
  function handleMessage(message) {
    switch (message.type) {
      case 'updateState':
        updateState(message.data);
        break;
      case 'aiResponse':
        addAIMessage(message.data);
        // Reset generating state when response is complete
        state.isGenerating = false;
        updateGeneratingUI();
        break;
      case 'typingIndicator':
        showTypingIndicator(message.data.active);
        break;
      case 'previewImage':
        showImageModal(message.data.src);
        break;
      case 'error':
        showError(message.data.message);
        // Reset generating state on error
        state.isGenerating = false;
        updateGeneratingUI();
        break;
      case 'enhancedPrompt':
        if (message.data) {
          elements.messageInput.value = message.data;
          elements.messageInput.focus();
          updateSendButtonState();
        }
        break;
      case 'getCurrentPrompt':
        sendMessage({ type: 'currentPrompt', data: elements.messageInput.value });
        break;
      case 'mentionItems':
        renderMentionItems(message.data || []);
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

    // Message header with timestamp and edit button
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTimestamp(msg.timestamp || new Date());
    headerDiv.appendChild(timestamp);

    // Add edit button for user messages
    if (msg.role === 'user') {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn message-edit-btn';
      editBtn.title = 'Edit message';
      editBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/>
        </svg>
      `;
      editBtn.addEventListener('click', () => editMessage(msg.id));
      headerDiv.appendChild(editBtn);
    }

    messageDiv.appendChild(headerDiv);

    // Message content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.setAttribute('data-message-id', msg.id);

    if (msg.role === 'user') {
      contentDiv.textContent = msg.content;
    } else {
      // Render markdown for assistant messages
      contentDiv.innerHTML = renderMarkdown(msg.content);
    }

    messageDiv.appendChild(contentDiv);

    // Add attachments if any
    if (msg.attachments && msg.attachments.length > 0) {
      const attachmentsDiv = document.createElement('div');
      attachmentsDiv.className = 'message-attachments';
      msg.attachments.forEach(att => {
        const attEl = document.createElement('div');
        attEl.className = 'message-attachment';
        attEl.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/>
          </svg>
          <span>${att.name}</span>
        `;
        attachmentsDiv.appendChild(attEl);
      });
      messageDiv.appendChild(attachmentsDiv);
    }

    return messageDiv;
  }

  // Format timestamp
  function formatTimestamp(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  // Edit message
  function editMessage(messageId) {
    const message = state.messages.find(m => m.id === messageId);
    if (!message || message.role !== 'user') return;

    const contentEl = document.querySelector(`.message-content[data-message-id="${messageId}"]`);
    if (!contentEl) return;

    const originalContent = message.content;

    // Make content editable
    contentEl.contentEditable = true;
    contentEl.classList.add('message-content-editable');
    contentEl.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Create edit actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-edit-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const newContent = contentEl.textContent.trim();
      if (newContent && newContent !== originalContent) {
        message.content = newContent;
        sendMessage({ type: 'editMessage', data: { messageId, content: newContent } });
      }
      contentEl.contentEditable = false;
      contentEl.classList.remove('message-content-editable');
      actionsDiv.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-edit-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      contentEl.textContent = originalContent;
      contentEl.contentEditable = false;
      contentEl.classList.remove('message-content-editable');
      actionsDiv.remove();
    });

    actionsDiv.appendChild(cancelBtn);
    actionsDiv.appendChild(saveBtn);
    contentEl.parentElement.appendChild(actionsDiv);

    // Handle Enter key
    contentEl.addEventListener('keydown', function handleEnter(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
        contentEl.removeEventListener('keydown', handleEnter);
      } else if (e.key === 'Escape') {
        cancelBtn.click();
        contentEl.removeEventListener('keydown', handleEnter);
      }
    });
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

    // Render user attachments
    state.attachments.forEach((att, index) => {
      const pill = createAttachmentPill(att, index, false);
      elements.contextPills.appendChild(pill);
    });

    // Render context attachments (memories, rules, selection)
    if (state.contextAttachments) {
      state.contextAttachments.forEach((att, index) => {
        const pill = createAttachmentPill(att, index, true);
        elements.contextPills.appendChild(pill);
      });
    }

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
  function createAttachmentPill(att, index, isContext = false) {
    const pill = document.createElement('div');
    pill.className = `context-pill ${isContext ? 'context-pill-context' : ''}`;
    pill.setAttribute('data-index', index);
    if (isContext) {
      pill.setAttribute('data-context-id', att.name || `context-${index}`);
    }

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
        if (isContext) {
          const contextId = pill.getAttribute('data-context-id');
          sendMessage({ type: 'dismissContext', data: { id: contextId } });
        } else {
          sendMessage({ type: 'removeAttachment', data: { index } });
        }
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

    // Set generating state
    state.isGenerating = true;
    updateGeneratingUI();

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

  // Stop generation
  function stopGeneration() {
    state.isGenerating = false;
    updateGeneratingUI();
    sendMessage({ type: 'command', data: { command: 'stopGeneration' } });
  }

  // Update UI based on generating state
  function updateGeneratingUI() {
    if (elements.stopBtn && elements.sendBtn) {
      if (state.isGenerating) {
        elements.stopBtn.classList.remove('hidden');
        elements.sendBtn.style.display = 'none';
      } else {
        elements.stopBtn.classList.add('hidden');
        elements.sendBtn.style.display = 'flex';
      }
    }
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

  // Title editing functions
  function enableTitleEditing() {
    if (!elements.projectTitle) return;

    const currentTitle = elements.projectTitle.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'project-title-edit';
    input.value = currentTitle;

    // Replace span with input
    elements.projectTitle.style.display = 'none';
    elements.projectTitle.parentElement.insertBefore(input, elements.projectTitle);

    input.focus();
    input.select();

    // Save on Enter, cancel on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveTitleEdit(input, currentTitle);
      } else if (e.key === 'Escape') {
        cancelTitleEdit(input);
      }
    });

    // Save on blur
    input.addEventListener('blur', () => {
      setTimeout(() => {
        saveTitleEdit(input, currentTitle);
      }, 100);
    });
  }

  function saveTitleEdit(input, originalTitle) {
    if (!input || !elements.projectTitle) return;

    const newTitle = input.value.trim();
    if (newTitle && newTitle !== originalTitle) {
      elements.projectTitle.textContent = newTitle;
      state.threadTitle = newTitle;
      sendMessage({ type: 'command', data: { command: 'renameThread', payload: { title: newTitle } } });
    }

    // Remove input and show span
    input.remove();
    elements.projectTitle.style.display = '';
  }

  function cancelTitleEdit(input) {
    if (!input || !elements.projectTitle) return;

    // Remove input and show span
    input.remove();
    elements.projectTitle.style.display = '';
  }

  // Toggle dropdown menu
  function toggleDropdownMenu() {
    if (elements.dropdownMenu) {
      elements.dropdownMenu.classList.toggle('show');
    }
  }

  // Hide dropdown menu
  function hideDropdownMenu() {
    if (elements.dropdownMenu) {
      elements.dropdownMenu.classList.remove('show');
    }
  }

  // Toggle threads panel
  function toggleThreadsPanel() {
    if (elements.threadsPanel) {
      elements.threadsPanel.classList.toggle('show');
      if (elements.threadsPanel.classList.contains('show')) {
        loadThreadHistory();
      }
    }
  }

  // Hide threads panel
  function hideThreadsPanel() {
    if (elements.threadsPanel) {
      elements.threadsPanel.classList.remove('show');
    }
  }

  // Handle thread search
  function handleThreadSearch(query) {
    const searchQuery = query.trim().toLowerCase();

    // Show/hide clear button
    if (elements.clearSearchBtn) {
      if (searchQuery) {
        elements.clearSearchBtn.classList.remove('hidden');
      } else {
        elements.clearSearchBtn.classList.add('hidden');
      }
    }

    // Filter threads
    if (!elements.threadsContent) return;

    const threadItems = elements.threadsContent.querySelectorAll('.thread-item');
    const threadGroups = elements.threadsContent.querySelectorAll('.thread-group');

    if (!searchQuery) {
      // Show all threads and groups
      threadItems.forEach(item => item.style.display = '');
      threadGroups.forEach(group => group.style.display = '');
      return;
    }

    // Hide all groups initially
    threadGroups.forEach(group => {
      const visibleThreads = [];
      const threads = group.querySelectorAll('.thread-item');

      threads.forEach(item => {
        const title = item.querySelector('.thread-title')?.textContent.toLowerCase() || '';
        const preview = item.querySelector('.thread-preview')?.textContent.toLowerCase() || '';

        if (title.includes(searchQuery) || preview.includes(searchQuery)) {
          item.style.display = '';
          visibleThreads.push(item);
        } else {
          item.style.display = 'none';
        }
      });

      // Show group only if it has visible threads
      if (visibleThreads.length > 0) {
        group.style.display = '';
      } else {
        group.style.display = 'none';
      }
    });
  }

  // Load thread history
  function loadThreadHistory() {
    if (!elements.threadsContent) return;

    // Mock data - in real implementation, this would come from state
    const threads = [
      {
        id: 'thread-1',
        title: 'Project summary: Denix AI extension',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        active: true
      },
      {
        id: 'thread-2',
        title: 'New Agent',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        active: false
      }
    ];

    // Group threads by time period
    const groups = groupThreadsByTime(threads);

    // Render thread groups
    elements.threadsContent.innerHTML = '';
    Object.keys(groups).forEach(groupName => {
      const groupThreads = groups[groupName];
      if (groupThreads.length > 0) {
        const groupEl = createThreadGroup(groupName, groupThreads);
        elements.threadsContent.appendChild(groupEl);
      }
    });
  }

  // Group threads by time period
  function groupThreadsByTime(threads) {
    const now = new Date();
    const groups = {
      'Last 7 days': [],
      'Last 30 days': [],
      'Older': []
    };

    threads.forEach(thread => {
      const daysDiff = Math.floor((now - thread.timestamp) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        groups['Last 7 days'].push(thread);
      } else if (daysDiff <= 30) {
        groups['Last 30 days'].push(thread);
      } else {
        groups['Older'].push(thread);
      }
    });

    return groups;
  }

  // Create thread group element
  function createThreadGroup(title, threads) {
    const group = document.createElement('div');
    group.className = 'thread-group';

    const titleEl = document.createElement('div');
    titleEl.className = 'thread-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);

    threads.forEach(thread => {
      const threadEl = createThreadItem(thread);
      group.appendChild(threadEl);
    });

    return group;
  }

  // Create thread item element
  function createThreadItem(thread) {
    const item = document.createElement('div');
    item.className = 'thread-item' + (thread.active ? ' active' : '');
    item.dataset.threadId = thread.id;

    item.innerHTML = `
      <svg class="thread-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 2L14 2M2 8L14 8M2 14L14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div class="thread-item-content">
        <div class="thread-item-title">${thread.title}</div>
      </div>
      <button class="icon-btn thread-item-menu-btn" data-thread-id="${thread.id}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5"/>
          <circle cx="8" cy="8" r="1.5"/>
          <circle cx="8" cy="13" r="1.5"/>
        </svg>
      </button>
    `;

    // Click to switch thread
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.thread-item-menu-btn')) {
        switchThread(thread.id);
      }
    });

    // Menu button
    const menuBtn = item.querySelector('.thread-item-menu-btn');
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      showThreadContextMenu(e.currentTarget, thread);
    });

    return item;
  }

  // Show thread context menu
  function showThreadContextMenu(button, thread) {
    // Remove any existing context menu
    document.querySelectorAll('.thread-context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'thread-context-menu show';

    menu.innerHTML = `
      <button class="thread-menu-item" data-action="rename">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/>
        </svg>
        <span>Rename</span>
      </button>
      <button class="thread-menu-item" data-action="pin">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
        </svg>
        <span>Pin</span>
      </button>
      <div class="thread-menu-divider"></div>
      <button class="thread-menu-item danger" data-action="delete">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
        <span>Delete</span>
      </button>
      <div class="thread-menu-divider"></div>
      <button class="thread-menu-item" data-action="export">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 6.5a.5.5 0 0 0-1 0v3.793L6.354 9.146a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L8.5 10.293V6.5z"/>
          <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
        </svg>
        <span>Export conversation</span>
      </button>
      <button class="thread-menu-item" data-action="import">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 11.5a.5.5 0 0 1-1 0V7.707L6.354 8.854a.5.5 0 1 1-.708-.708l2-2a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 7.707V11.5z"/>
          <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
        </svg>
        <span>Import conversation</span>
      </button>
    `;

    // Position menu relative to button
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(menu);

    // Handle menu item clicks
    menu.querySelectorAll('.thread-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        handleThreadAction(action, thread);
        menu.remove();
      });
    });

    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }

  // Handle thread actions
  function handleThreadAction(action, thread) {
    switch (action) {
      case 'rename':
        sendMessage({ type: 'command', data: { command: 'renameThread', payload: { threadId: thread.id } } });
        break;
      case 'pin':
        sendMessage({ type: 'command', data: { command: 'pinThread', payload: { threadId: thread.id } } });
        break;
      case 'delete':
        sendMessage({ type: 'command', data: { command: 'deleteThread', payload: { threadId: thread.id } } });
        break;
      case 'export':
        sendMessage({ type: 'command', data: { command: 'exportThread', payload: { threadId: thread.id } } });
        break;
      case 'import':
        sendMessage({ type: 'command', data: { command: 'importThread' } });
        break;
    }
  }

  // Switch to a different thread
  function switchThread(threadId) {
    sendMessage({ type: 'command', data: { command: 'switchThread', payload: { threadId } } });
    hideThreadsPanel();
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

  // Mention Picker Functions
  function toggleMentionPicker() {
    if (elements.mentionPicker?.classList.contains('show')) {
      hideMentionPicker(true);
    } else {
      showMentionPicker(true);
    }
  }

  function showMentionPicker(focusSearch = false) {
    if (!elements.mentionPicker || !elements.mentionBtn) return;
    elements.mentionPicker.classList.add('show');
    elements.mentionPicker.setAttribute('aria-hidden', 'false');
    elements.mentionBtn.classList.add('active');
    elements.mentionBtn.setAttribute('aria-expanded', 'true');
    selectedMentionIndex = -1;
    if (elements.mentionSearchInput) {
      elements.mentionSearchInput.value = '';
    }
    mentionSearchTerm = '';
    renderMentionItems(workspaceMentionItems);
    requestMentionItems('');
    if (focusSearch) {
      setTimeout(() => elements.mentionSearchInput?.focus(), 10);
    }
  }

  function hideMentionPicker(returnFocus = false) {
    if (!elements.mentionPicker || !elements.mentionBtn) return;
    elements.mentionPicker.classList.remove('show');
    elements.mentionPicker.setAttribute('aria-hidden', 'true');
    elements.mentionBtn.classList.remove('active');
    elements.mentionBtn.setAttribute('aria-expanded', 'false');
    selectedMentionIndex = -1;
    if (returnFocus) {
      elements.mentionBtn.focus();
    }
  }

  function requestMentionItems(query = '') {
    sendMessage({
      type: 'getMentionItems',
      data: { query }
    });
  }

  function handleMentionSearch(query) {
    mentionSearchTerm = query.toLowerCase();
    renderMentionItems(workspaceMentionItems);
  }

  function handleMentionKeydown(e) {
    if (!elements.mentionSuggestions?.children.length) {
      return;
    }
    const items = elements.mentionSuggestions.querySelectorAll('.mention-item');
    if (!items.length) {
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedMentionIndex = Math.min(selectedMentionIndex + 1, mentionItems.length - 1);
        updateMentionSelection(items);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0);
        updateMentionSelection(items);
        break;
      case 'Enter':
        e.preventDefault();
        if (mentionItems[selectedMentionIndex]) {
          performMentionAction(mentionItems[selectedMentionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        hideMentionPicker(true);
        break;
    }
  }

  function updateMentionSelection(items) {
    items.forEach((item, index) => {
      if (index === selectedMentionIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function performMentionAction(item) {
    if (!item) return;
    switch (item.action) {
      case 'insert':
        insertMentionToken(item.token || `@${item.label}`);
        hideMentionPicker(true);
        break;
      case 'command':
        if (item.command === 'clearContext') {
          sendMessage({ type: 'command', data: { command: 'clearContext' } });
        }
        hideMentionPicker(true);
        break;
      case 'panel':
        hideMentionPicker(true);
        break;
      case 'selection':
        insertSelectionIntoInput();
        hideMentionPicker(true);
        break;
      default:
        insertMentionToken(item.token || `@${item.label}`);
        hideMentionPicker(true);
        break;
    }
  }

  function insertMentionToken(token) {
    if (!elements.messageInput) return;
    const textarea = elements.messageInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const insertText = `${token} `;
    textarea.value = text.slice(0, start) + insertText + text.slice(end);
    textarea.focus();
    const cursor = start + insertText.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    updateSendButtonState();
  }

  function renderMentionItems(itemsFromExtension = []) {
    workspaceMentionItems = itemsFromExtension.map(item => ({
      id: item.path || item.label,
      label: item.label,
      description: item.path || item.category,
      group: item.category || 'Workspace',
      action: 'insert',
      token: item.path ? `@${item.path}` : `@${item.label}`,
      icon: item.icon || item.type
    }));

    const filtered = [...quickMentionItems, ...workspaceMentionItems].filter(item => {
      if (!mentionSearchTerm) return true;
      return (
        item.label.toLowerCase().includes(mentionSearchTerm) ||
        (item.description || '').toLowerCase().includes(mentionSearchTerm)
      );
    });

    mentionItems = filtered;
    selectedMentionIndex = filtered.length ? 0 : -1;

    if (!elements.mentionSuggestions) return;
    if (!filtered.length) {
      elements.mentionSuggestions.innerHTML = '<div class="mention-empty">No matches found</div>';
      return;
    }

    const grouped = filtered.reduce((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {});

    const order = Object.keys(grouped);
    let html = '';
    order.forEach(group => {
      html += `<div class="mention-category">${group}</div>`;
      grouped[group].forEach((item, index) => {
        const globalIndex = mentionItems.indexOf(item);
        const icon = getMentionIcon(item.icon);
        html += `
          <button class="mention-item" role="option" data-index="${globalIndex}">
            <div class="mention-item-icon">${icon}</div>
            <div class="mention-item-content">
              <div class="mention-item-label">${escapeHtml(item.label)}</div>
              <div class="mention-item-path">${escapeHtml(item.description || '')}</div>
            </div>
          </button>
        `;
      });
    });

    elements.mentionSuggestions.innerHTML = html;
    const renderedItems = elements.mentionSuggestions.querySelectorAll('.mention-item');
    renderedItems.forEach(item => {
      item.addEventListener('click', () => {
        const index = Number(item.getAttribute('data-index'));
        performMentionAction(mentionItems[index]);
      });
    });
    updateMentionSelection(renderedItems);
  }

  function getMentionIcon(iconType) {
    const icons = {
      context: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/></svg>',
      target: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><path d="M8 3v2M8 11v2M3 8h2M11 8h2"/></svg>',
      memories: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5c1.2-2 3.2-3 5-3s3.8 1 5 3M3 11c1.2 2 3.2 3 5 3s3.8-1 5-3M3 8h10"/><circle cx="8" cy="8" r="1"/></svg>',
      rules: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h6l2 2v10H4z"/><path d="M10 2v2h2"/><path d="M6 7h4M6 10h3"/></svg>',
      selection: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="10" height="6" rx="1"/><path d="M6 2v3M10 2v3M6 11v3M10 11v3"/></svg>',
      file: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2h5l3 3v9H5z"/><path d="M10 2v3h3"/></svg>'
    };
    return icons[iconType] || icons.file;
  }



  // Selection helpers - just update button state
  function updateSelectionContext(selection) {
    currentSelectionContext = selection;
    const hasSelection = !!selection;
    if (elements.selectionBtn) {
      elements.selectionBtn.disabled = !hasSelection;
      elements.selectionBtn.classList.toggle('disabled', !hasSelection);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

