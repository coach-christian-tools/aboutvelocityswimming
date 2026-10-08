chrome.action.onClicked.addListener(async (tab) => {
  // Prevent execution on Chrome's internal or restricted pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore')) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyDynamicHtmlToClipboard
    });
    
    // Show a temporary "OK" badge for success
    await chrome.action.setBadgeText({ text: 'OK', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#00C851', tabId: tab.id });
    
    // Clear the badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
    
  } catch (error) {
    console.error('Failed to copy HTML:', error);
    // Show an error badge
    await chrome.action.setBadgeText({ text: 'ERR', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tab.id });
  }
});

// This function is executed in the context of the webpage
async function copyDynamicHtmlToClipboard() {
  try {
    // Get the current dynamically rendered HTML
    const html = document.documentElement.outerHTML;
    
    try {
      // Attempt modern Clipboard API
      await navigator.clipboard.writeText(html);
    } catch {
      // Fallback for older browsers or cases where Clipboard API is blocked
      const textArea = document.createElement('textarea');
      textArea.value = html;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
      } catch (e) {
        console.error('Fallback copy failed', e);
        throw e;
      } finally {
        textArea.remove();
      }
    }
  } catch {
    console.error('Failed to copy the HTML:', err);
    throw err; // Rethrow to let the background script catch it and show ERR badge
  }
}
