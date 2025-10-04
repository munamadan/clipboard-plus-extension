// ClipBoard+ Background Service Worker
// Handles: Queue management, context menu, message passing, IndexedDB operations

// In-memory queue for fast access
let clipboardQueue = [];
let lastInternalCopyHash = null;
let internalCopyTimeout = null;

// Constants
const MAX_QUEUE_SIZE = 50;
const INTERNAL_COPY_WINDOW = 500; // ms

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('ClipBoard+ installed');
  
  // Create context menu for images
  chrome.contextMenus.create({
    id: 'copyToClipboardPlus',
    title: 'Copy to ClipBoard+',
    contexts: ['image', 'video', 'link']
  });
  
  // Load settings with defaults
  const settings = await chrome.storage.local.get({
    allowDuplicates: false,
    theme: 'light'
  });
  
  await chrome.storage.local.set(settings);
  
  // Load existing queue from IndexedDB
  await loadQueueFromDB();
  
  // Update badge with item count
  updateBadge();
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'copyToClipboardPlus') {
    console.log('Context menu clicked:', info.srcUrl);
    
    if (info.srcUrl) {
      await captureMedia(info.srcUrl, info.mediaType || 'image');
    }
  }
});

// Message handler from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type);
  
  (async () => {
    try {
      switch (message.type) {
        case 'textCopied':
          await handleTextCopy(message.content);
          sendResponse({ success: true });
          break;
          
        case 'getQueue':
          sendResponse({ queue: clipboardQueue });
          break;
          
        case 'internalCopy':
          handleInternalCopy(message.hash);
          sendResponse({ success: true });
          break;
          
        case 'pinItem':
          await pinItem(message.id);
          sendResponse({ success: true });
          break;
          
        case 'unpinItem':
          await unpinItem(message.id);
          sendResponse({ success: true });
          break;
          
        case 'deleteItem':
          await deleteItem(message.id);
          sendResponse({ success: true });
          break;
          
        case 'addImage':
          await addImageToQueue(message.data);
          sendResponse({ success: true });
          break;
          
        case 'clearAll':
          await clearAllItems();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Handle text copy from content script
async function handleTextCopy(content) {
  if (!content || content.trim() === '') return;
  
  // Generate hash for duplicate detection and self-copy prevention
  const hash = await generateHash(content);
  
  // Check if this is our own copy
  if (hash === lastInternalCopyHash) {
    console.log('Self-copy detected, skipping');
    return;
  }
  
  // Check duplicate settings
  const settings = await chrome.storage.local.get('allowDuplicates');
  if (!settings.allowDuplicates) {
    const duplicate = clipboardQueue.find(item => item.hash === hash);
    if (duplicate) {
      console.log('Duplicate detected, skipping');
      return;
    }
  }
  
  // Create new item
  const newItem = {
    id: generateUUID(),
    type: 'text',
    content: content,
    hash: hash,
    timestamp: Date.now(),
    pinned: false,
    source: 'auto'
  };
  
  // Add to queue
  await addToQueue(newItem);
}

// Capture media from context menu
async function captureMedia(url, mediaType) {
  try {
    console.log('Fetching media:', url);
    
    // Fetch the image
    const response = await fetch(url);
    const blob = await response.blob();
    
    // Generate thumbnail
    const thumbnail = await createThumbnail(blob);
    
    // Create item
    const newItem = {
      id: generateUUID(),
      type: mediaType === 'video' ? 'gif' : 'image',
      thumbnail: thumbnail,
      originalUrl: url,
      hash: await generateHash(url),
      timestamp: Date.now(),
      pinned: false,
      source: 'manual'
    };
    
    await addToQueue(newItem);
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'ClipBoard+',
      message: 'Image added to clipboard history'
    });
  } catch (error) {
    console.error('Error capturing media:', error);
  }
}

// Add image from drag-and-drop
async function addImageToQueue(imageData) {
  const newItem = {
    id: generateUUID(),
    type: 'image',
    thumbnail: imageData.thumbnail,
    originalUrl: imageData.originalUrl || null,
    hash: await generateHash(imageData.thumbnail),
    timestamp: Date.now(),
    pinned: false,
    source: 'manual'
  };
  
  await addToQueue(newItem);
}

// Add item to queue with FIFO logic
async function addToQueue(newItem) {
  // Check if queue is full
  if (clipboardQueue.length >= MAX_QUEUE_SIZE) {
    // Find oldest unpinned item
    const unpinnedItems = clipboardQueue.filter(item => !item.pinned);
    
    if (unpinnedItems.length === 0) {
      console.error('Cannot add: All 50 items are pinned');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'ClipBoard+ Full',
        message: 'Cannot add new item: 50 items are pinned'
      });
      return;
    }
    
    // Remove oldest unpinned
    const oldest = unpinnedItems.reduce((a, b) => 
      a.timestamp < b.timestamp ? a : b
    );
    
    await deleteItem(oldest.id, false);
  }
  
  // Add new item to front
  clipboardQueue.unshift(newItem);
  
  // Save to IndexedDB
  await saveItemToDB(newItem);
  
  // Update badge
  updateBadge();
  
  console.log('Item added to queue:', newItem.id);
}

// Pin/Unpin item
async function pinItem(id) {
  const item = clipboardQueue.find(i => i.id === id);
  if (item) {
    item.pinned = true;
    await updateItemInDB(item);
    console.log('Item pinned:', id);
  }
}

async function unpinItem(id) {
  const item = clipboardQueue.find(i => i.id === id);
  if (item) {
    item.pinned = false;
    await updateItemInDB(item);
    console.log('Item unpinned:', id);
  }
}

// Delete item
async function deleteItem(id, notify = true) {
  const index = clipboardQueue.findIndex(i => i.id === id);
  if (index !== -1) {
    clipboardQueue.splice(index, 1);
    await deleteItemFromDB(id);
    updateBadge();
    
    if (notify) {
      console.log('Item deleted:', id);
    }
  }
}

// Clear all items
async function clearAllItems() {
  clipboardQueue = [];
  await clearDB();
  updateBadge();
  console.log('All items cleared');
}

// Handle internal copy (from extension)
function handleInternalCopy(hash) {
  lastInternalCopyHash = hash;
  
  // Clear after timeout
  if (internalCopyTimeout) {
    clearTimeout(internalCopyTimeout);
  }
  
  internalCopyTimeout = setTimeout(() => {
    lastInternalCopyHash = null;
  }, INTERNAL_COPY_WINDOW);
  
  console.log('Internal copy registered:', hash);
}

// Update extension badge
function updateBadge() {
  const count = clipboardQueue.length;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
}

// Generate SHA-256 hash
async function generateHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Create thumbnail from blob
async function createThumbnail(blob, maxSize = 200) {
  // For service workers, we'll use OffscreenCanvas
  try {
    const bitmap = await createImageBitmap(blob);
    
    let { width, height } = bitmap;
    
    // Scale down proportionally
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
    
    // Create offscreen canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    // Convert to blob then to data URL
    const resizedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.7
    });
    
    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(resizedBlob);
    });
  } catch (error) {
    console.error('Thumbnail creation error:', error);
    // Fallback: return original blob as data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// IndexedDB operations
async function loadQueueFromDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('ClipboardDB', 1);
    
    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      resolve();
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('clipboardItems', 'readonly');
      const store = tx.objectStore('clipboardItems');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        clipboardQueue = getAllRequest.result.sort((a, b) => b.timestamp - a.timestamp);
        console.log('Queue loaded from DB:', clipboardQueue.length, 'items');
        resolve();
      };
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('clipboardItems')) {
        db.createObjectStore('clipboardItems', { keyPath: 'id' });
      }
    };
  });
}

async function saveItemToDB(item) {
  return new Promise((resolve) => {
    const request = indexedDB.open('ClipboardDB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('clipboardItems', 'readwrite');
      const store = tx.objectStore('clipboardItems');
      store.put(item);
      
      tx.oncomplete = () => resolve();
    };
  });
}

async function updateItemInDB(item) {
  await saveItemToDB(item);
}

async function deleteItemFromDB(id) {
  return new Promise((resolve) => {
    const request = indexedDB.open('ClipboardDB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('clipboardItems', 'readwrite');
      const store = tx.objectStore('clipboardItems');
      store.delete(id);
      
      tx.oncomplete = () => resolve();
    };
  });
}

async function clearDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('ClipboardDB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('clipboardItems', 'readwrite');
      const store = tx.objectStore('clipboardItems');
      store.clear();
      
      tx.oncomplete = () => resolve();
    };
  });
}

console.log('ClipBoard+ background service worker loaded');