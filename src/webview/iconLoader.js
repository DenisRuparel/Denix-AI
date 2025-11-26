// Icon loader utility for chat panel
// This file will be inlined in the webview HTML

(function() {
  'use strict';
  
  // Icon mapping: button ID -> icon filename (without extension)
  const iconMap = {
    // Header icons
    'hamburger-btn': 'menu',
    'plus-btn': 'add',
    'menu-btn': 'more',
    'back-btn': 'back',
    'refresh-btn': 'refresh',
    'add-thread-btn': 'add',
    'clear-search-btn': 'close',
    
    // Quick actions
    'mention-btn': 'mention',
    'memories-btn': 'memory',
    'ask-question-btn': 'ask-question',
    'selection-btn': 'selected-text',
    
    // Action buttons
    'enhance-btn': 'enhance-prompt',
    'attach-btn': 'attach',
    'stop-btn': 'stop',
    
    // Tab icons
    'tab-thread': 'thread',
    'tab-tasks': 'tasks',
    'tab-edits': 'edits',
    
    // Model button (uses emoji, can be replaced with image)
    'model-btn': 'robot'
  };
  
  // Track which buttons have been processed to prevent duplicates
  const processedButtons = new Set();
  
  // Initialize icon replacement
  function initIcons() {
    const mediaUri = window.mediaUri || '';
    if (!mediaUri) {
      console.warn('Media URI not available, using SVG icons');
      return;
    }
    
    // Replace icons for each button
    Object.keys(iconMap).forEach(buttonId => {
      const button = document.getElementById(buttonId);
      if (!button) return;
      
      // Skip if already processed
      if (processedButtons.has(buttonId)) return;
      
      const iconName = iconMap[buttonId];
      const iconPath = `${mediaUri}/icons/${iconName}.png`;
      
      // Find SVG element inside button
      const svg = button.querySelector('svg');
      if (!svg) return;
      
      // Check if image already exists
      const existingImg = button.querySelector('.icon-img');
      if (existingImg) return;
      
      // Mark as processed
      processedButtons.add(buttonId);
      
      // Create image element
      const img = document.createElement('img');
      img.src = iconPath;
      img.alt = iconName;
      img.className = 'icon-img';
      img.style.width = svg.getAttribute('width') || '16px';
      img.style.height = svg.getAttribute('height') || '16px';
      img.style.objectFit = 'contain';
      img.style.display = 'none'; // Hide initially
      
      // On error, show SVG; on success, show image and hide SVG
      img.onerror = function() {
        this.style.display = 'none';
        if (svg) {
          svg.style.display = '';
          svg.style.visibility = 'visible';
        }
      };
      
      img.onload = function() {
        this.style.display = 'block';
        if (svg) {
          svg.style.display = 'none';
          svg.style.visibility = 'hidden';
        }
      };
      
      // Insert image before SVG
      svg.parentNode.insertBefore(img, svg);
    });
    
    // Special handling for model button (emoji replacement)
    if (!processedButtons.has('model-btn')) {
      const modelBtn = document.getElementById('model-btn');
      if (modelBtn) {
        const modelIcon = modelBtn.querySelector('.model-icon');
        if (modelIcon && mediaUri) {
          // Check if image already exists
          const existingImg = modelBtn.querySelector('.model-icon-img');
          if (existingImg) return;
          
          processedButtons.add('model-btn');
          
          const robotImg = document.createElement('img');
          robotImg.src = `${mediaUri}/icons/robot.png`;
          robotImg.alt = 'robot';
          robotImg.className = 'model-icon-img';
          robotImg.style.width = '16px';
          robotImg.style.height = '16px';
          robotImg.style.objectFit = 'contain';
          robotImg.style.display = 'none';
          
          robotImg.onerror = function() {
            this.style.display = 'none';
            if (modelIcon) {
              modelIcon.style.display = '';
              modelIcon.style.visibility = 'visible';
            }
          };
          
          robotImg.onload = function() {
            this.style.display = 'inline-block';
            if (modelIcon) {
              modelIcon.style.display = 'none';
              modelIcon.style.visibility = 'hidden';
            }
          };
          
          modelIcon.parentNode.insertBefore(robotImg, modelIcon);
        }
      }
    }
  }
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIcons);
  } else {
    initIcons();
  }
  
  // Also run after a short delay to catch dynamically added elements
  // Use a flag to prevent multiple runs
  let initTimeout = null;
  setTimeout(() => {
    if (initTimeout) clearTimeout(initTimeout);
    initTimeout = setTimeout(initIcons, 100);
  }, 50);
})();

