// Content script injected into Cutter Coach web app
// Acts as a bridge between the webpage context (postMessage) and the extension background worker.

window.addEventListener('message', (event) => {
  // Ensure the message is coming from our trusted web app origins
  const origin = event.origin;
  if (event.source !== window || origin !== window.location.origin) return;
  const { hostname, protocol } = new URL(origin);
  const local = protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname);
  const hosted = protocol === 'https:' && (['aboutvelocityswimming.com', 'www.aboutvelocityswimming.com', 'velocity-swimming.com'].includes(hostname) || hostname.endsWith('.velocity-swimming.com'));
  if (!local && !hosted) return;

  if (event.data && event.data.type === 'CUTTER_COACH_SWIMCLOUD_FETCH') {
    console.log('[Content Bridge] Received fetch request for Swimcloud ID:', event.data.swimcloudId);
    
    try {
      // Relay the fetch command to the background service worker
      chrome.runtime.sendMessage({
        type: 'FETCH_SWIMCLOUD',
        swimcloudId: event.data.swimcloudId
      }, (response) => {
        // Handle disconnected extension or background error
        if (chrome.runtime.lastError) {
          console.error('[Content Bridge] Extension runtime error:', chrome.runtime.lastError.message);
          window.postMessage({
            type: 'CUTTER_COACH_SWIMCLOUD_RESULT',
            swimcloudId: event.data.swimcloudId,
            response: { success: false, error: chrome.runtime.lastError.message }
          }, origin);
          return;
        }
        
        console.log('[Content Bridge] Received response from background:', response);
        // Send the response back to the web app
        window.postMessage({
          type: 'CUTTER_COACH_SWIMCLOUD_RESULT',
          swimcloudId: event.data.swimcloudId,
          response: response
        }, origin);
      });
    } catch (e) {
      console.error('[Content Bridge] Extension context invalidated or error:', e);
      window.postMessage({
        type: 'CUTTER_COACH_SWIMCLOUD_RESULT',
        swimcloudId: event.data.swimcloudId,
        response: { success: false, error: "Extension context invalidated. Please refresh the page." }
      }, origin);
    }
  }
});

// Announce to the web app that the extension is installed and active
console.log('[Content Bridge] Injected and listening for Cutter Coach messages.');
window.postMessage({ type: 'CUTTER_COACH_EXTENSION_READY' }, '*');
