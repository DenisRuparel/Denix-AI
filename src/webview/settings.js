// Settings Panel Client Script
(function() {
  'use strict';

  const vscode = acquireVsCodeApi();
  window.vscode = vscode;
  
  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupFormInputs();
    setupRangeSliders();
  });

  // Setup sidebar navigation
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        goToSection(section);
      });
    });
  }

  // Navigate to a section
  window.goToSection = function(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    
    // Show selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
      selectedSection.classList.add('active');
    }
    
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      }
    });
    
    // Scroll to top
    document.querySelector('.settings-content').scrollTop = 0;
  };

  // Setup form inputs
  function setupFormInputs() {
    // Auto-save on input change
    document.querySelectorAll('.form-control, input[type="checkbox"], input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => {
        if (input.id) {
          saveSetting(input.id, input.type === 'checkbox' ? input.checked : input.value);
        }
      });
    });
  }

  // Setup range sliders with live value display
  function setupRangeSliders() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
      slider.addEventListener('input', () => {
        const displayElement = slider.parentElement.querySelector('.value-display');
        if (displayElement) {
          displayElement.textContent = slider.value;
        }
      });
    });
  }

  // Save setting
  function saveSetting(key, value) {
    vscode.postMessage({
      type: 'saveSetting',
      key: key,
      value: value,
      scope: 'workspace'
    });
  }

  // Handle messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    
    if (message.type === 'settingValue') {
      const element = document.getElementById(message.key);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = message.value;
        } else {
          element.value = message.value;
        }
      }
    } else if (message.type === 'updateStats') {
      const titleEl = document.querySelector('.project-title');
      if (titleEl && message.stats.projectName) {
        titleEl.textContent = message.stats.projectName;
      }

      const statValues = document.querySelectorAll('.stat-value');
      if (statValues.length >= 2) {
        if (message.stats.files !== undefined) statValues[0].textContent = message.stats.files;
        if (message.stats.threads !== undefined) statValues[1].textContent = message.stats.threads;
      }

      const progressBar = document.querySelector('.progress-bar');
      const legend = document.querySelector('.legend');
      if (progressBar && legend && message.stats.languages) {
        progressBar.innerHTML = message.stats.languages.map(l => 
          `<div class="segment" style="width: ${l.percentage}%; background-color: ${l.color}; border-right: 2px solid var(--bg-card);"></div>`
        ).join('');
        
        legend.innerHTML = message.stats.languages.map(l => 
          `<div class="legend-item" style="background: ${l.color}33; color: ${l.color};">${l.name} ${l.percentage.toFixed(1)}%</div>`
        ).join('');
      }
    }
  });

  // Open external link
  window.openLink = function(url) {
    vscode.postMessage({
      type: 'openLink',
      url: url
    });
  };
})();
