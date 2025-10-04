// ClipBoard+ Popup Script
let clipboardQueue = [];

// DOM Elements
const clipboardContainer = document.getElementById('clipboardContainer');
const itemCount = document.getElementById('itemCount');
const settingsBtn = document.getElementById('settingsBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const duplicatesToggle = document.getElementById('duplicatesToggle');
const addManualBtn = document.getElementById('addManualBtn');
const addManualModal = document.getElementById('addManualModal');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const saveManualBtn = document.getElementById('saveManualBtn');
const manualTextInput = document.getElementById('manualTextInput');
const imagePasteZone = document.getElementById('imagePasteZone');
const pasteCanvas = document.getElementById('pasteCanvas');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadQueue();
  setupEventListeners();
});

// Load settings
async function loadSettings() {
  const settings = await chrome.storage.local.get(['theme', 'allowDuplicates']);
  
  // Apply theme (default: light)
  const isDark = settings.theme === 'dark';
  if (isDark) {
    document.body.classList.add('dark-theme');
    darkModeToggle.checked = true;
  } else {
    document.body.classList.remove('dark-theme');
    darkModeToggle.checked = false;
  }
  
  // Set duplicates toggle (default: false)
  duplicatesToggle.checked = settings.allowDuplicates || false;
}

// Load queue from background
async function loadQueue() {
  const response = await chrome.runtime.sendMessage({ type: 'getQueue' });
  clipboardQueue = response.queue || [];
  renderQueue();
}

// Render queue items
function renderQueue() {
  clipboardContainer.innerHTML = '';
  
  if (clipboardQueue.length === 0) {
    clipboardContainer.innerHTML = '<p class="empty-state">No clipboard history yet. Copy something!</p>';
    itemCount.textContent = '0 items';
    return;
  }
  
  clipboardQueue.forEach(item => {
    const itemEl = createItemElement(item);
    clipboardContainer.appendChild(itemEl);
  });
  
  itemCount.textContent = `${clipboardQueue.length} item${clipboardQueue.length !== 1 ? 's' : ''}`;
}

// Create item element
function createItemElement(item) {
  const div = document.createElement('div');
  div.className = 'clipboard-item';
  div.dataset.id = item.id;
  
  // Content preview
  let contentHTML = '';
  if (item.type === 'text') {
    const preview = item.content.length > 100 ? item.content.substring(0, 100) + '...' : item.content;
    contentHTML = `<p class="item-content">${escapeHtml(preview)}</p>`;
  } else {
    contentHTML = `<img src="${item.thumbnail}" alt="Clipboard image" class="item-image">`;
  }
  
  // Time ago
  const timeAgo = getTimeAgo(item.timestamp);
  
  div.innerHTML = `
    <div class="item-preview">
      ${contentHTML}
      <span class="item-time">${timeAgo}</span>
    </div>
    <div class="item-actions">
      <button class="action-btn copy-btn" title="Copy" data-id="${item.id}">📋</button>
      <button class="action-btn pin-btn ${item.pinned ? 'pinned' : ''}" title="${item.pinned ? 'Unpin' : 'Pin'}" data-id="${item.id}">
        ${item.pinned ? '📌' : '📍'}
      </button>
      <button class="action-btn delete-btn" title="Delete" data-id="${item.id}">🗑</button>
    </div>
  `;
  
  return div;
}

// Setup event listeners
function setupEventListeners() {
  // Copy button
  clipboardContainer.addEventListener('click', async (e) => {
    if (e.target.closest('.copy-btn')) {
      const id = e.target.closest('.copy-btn').dataset.id;
      await copyItem(id);
    }
    
    if (e.target.closest('.pin-btn')) {
      const id = e.target.closest('.pin-btn').dataset.id;
      await togglePin(id);
    }
    
    if (e.target.closest('.delete-btn')) {
      const id = e.target.closest('.delete-btn').dataset.id;
      await deleteItem(id);
    }
  });
  
  // Settings button
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
  
// Dark mode toggle
  darkModeToggle.addEventListener('change', async (e) => {
    if (e.target.checked) {
      document.body.classList.add('dark-theme');
      await chrome.storage.local.set({ theme: 'dark' });
    } else {
      document.body.classList.remove('dark-theme');
      await chrome.storage.local.set({ theme: 'light' });
    }
  });
  
  // Duplicates toggle
  duplicatesToggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ allowDuplicates: e.target.checked });
  });
  
  // Clear all button
  clearAllBtn.addEventListener('click', async () => {
    if (confirm('Clear all clipboard history? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ type: 'clearAll' });
      await loadQueue();
    }
  });
  
  // Manual add button
  addManualBtn.addEventListener('click', () => {
    addManualModal.classList.remove('hidden');
    manualTextInput.value = '';
    pasteCanvas.style.display = 'none';
    manualTextInput.focus();
  });
  
  cancelAddBtn.addEventListener('click', () => {
    addManualModal.classList.add('hidden');
  });
  
  saveManualBtn.addEventListener('click', async () => {
    await saveManualItem();
  });
  
  // Image paste zone
  imagePasteZone.addEventListener('click', () => {
    imagePasteZone.focus();
  });
  
  imagePasteZone.addEventListener('paste', async (e) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        await displayPastedImage(blob);
        break;
      }
    }
  });
  
  // Also allow text paste in the paste zone
  manualTextInput.addEventListener('paste', async (e) => {
    // Check if pasting an image
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        await displayPastedImage(blob);
        break;
      }
    }
  });
}

// Copy item to clipboard
async function copyItem(id) {
  const item = clipboardQueue.find(i => i.id === id);
  if (!item) return;
  
  try {
    if (item.type === 'text') {
      await navigator.clipboard.writeText(item.content);
      
      // Generate hash and notify background
      const hash = await generateHash(item.content);
      await chrome.runtime.sendMessage({ type: 'internalCopy', hash });
    } else {
      // For images, copy the URL or show notification
      if (item.originalUrl) {
        await navigator.clipboard.writeText(item.originalUrl);
      }
    }
    
    // Visual feedback
    showToast('Copied!');
  } catch (error) {
    console.error('Copy error:', error);
    showToast('Copy failed');
  }
}

// Toggle pin status
async function togglePin(id) {
  const item = clipboardQueue.find(i => i.id === id);
  if (!item) return;
  
  if (item.pinned) {
    await chrome.runtime.sendMessage({ type: 'unpinItem', id });
  } else {
    await chrome.runtime.sendMessage({ type: 'pinItem', id });
  }
  
  await loadQueue();
}

// Delete item
async function deleteItem(id) {
  await chrome.runtime.sendMessage({ type: 'deleteItem', id });
  await loadQueue();
}

// Handle image drop
async function handleImageDrop(file) {
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    const thumbnail = await createThumbnail(e.target.result);
    
    await chrome.runtime.sendMessage({
      type: 'addImage',
      data: {
        thumbnail: thumbnail,
        originalUrl: null
      }
    });
  };
  
  reader.readAsDataURL(file);
}

// Create thumbnail
async function createThumbnail(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      const maxSize = 200;
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    
    img.src = dataUrl;
  });
}

// Generate hash
async function generateHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Utility: Time ago
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Display pasted image
async function displayPastedImage(blob) {
  const img = new Image();
  const canvas = pasteCanvas;
  const ctx = canvas.getContext('2d');
  
  img.onload = () => {
    // Set canvas size
    const maxWidth = 280;
    let { width, height } = img;
    
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    canvas.style.display = 'block';
    
    // Clear text input when image is pasted
    manualTextInput.value = '';
  };
  
  img.src = URL.createObjectURL(blob);
}

// Save manual item
async function saveManualItem() {
  const text = manualTextInput.value.trim();
  const hasImage = pasteCanvas.style.display !== 'none';
  
  if (!text && !hasImage) {
    showToast('Please enter text or paste an image');
    return;
  }
  
  try {
    if (hasImage) {
      // Save image
      const thumbnail = pasteCanvas.toDataURL('image/jpeg', 0.7);
      await chrome.runtime.sendMessage({
        type: 'addImage',
        data: {
          thumbnail: thumbnail,
          originalUrl: null
        }
      });
      showToast('Image added!');
    } else {
      // Save text
      await chrome.runtime.sendMessage({
        type: 'textCopied',
        content: text
      });
      showToast('Text added!');
    }
    
    // Close modal and refresh
    addManualModal.classList.add('hidden');
    await loadQueue();
  } catch (error) {
    console.error('Error saving manual item:', error);
    showToast('Failed to add item');
  }
}