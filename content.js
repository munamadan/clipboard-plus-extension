// ClipBoard+ Content Script
// Runs on all web pages to detect copy events

// Listen for copy events
document.addEventListener('copy', async (e) => {
  try {
    // Small delay to ensure clipboard is populated
    setTimeout(async () => {
      // Read clipboard content
      const text = await navigator.clipboard.readText();
      
      if (text && text.trim() !== '') {
        // Send to background script
        chrome.runtime.sendMessage({
          type: 'textCopied',
          content: text
        });
      }
    }, 10);
  } catch (error) {
    console.error('ClipBoard+ copy detection error:', error);
  }
});

console.log('ClipBoard+ content script loaded');