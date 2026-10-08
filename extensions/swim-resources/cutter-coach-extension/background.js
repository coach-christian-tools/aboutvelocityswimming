chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_SWIMCLOUD') {
    (async () => {
      try {
        const url = `https://www.swimcloud.com/swimmer/${message.swimcloudId}/times/`;
        console.log(`[Cutter Coach Sync] Opening background tab for: ${url}`);

        // Open an inactive tab to act as a real browser navigation (bypasses Cloudflare fetch blocks)
        const tab = await chrome.tabs.create({ url, active: false });
        const tabId = tab.id;

        const extractedData = await new Promise((resolve) => {
          let attempts = 0;
          const maxAttempts = 20; // 20s timeout

          const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
              clearInterval(pollInterval);
              resolve([]);
              return;
            }

            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                   const rows = document.querySelectorAll('table tbody tr');
                   if (rows.length === 0) return null;

                   const data = [];
                   rows.forEach(row => {
                     const cells = row.querySelectorAll('td');
                     if (cells.length >= 4) {
                       const eventText = cells[0].textContent.trim();
                       const timeEl = cells[1].querySelector('a') || cells[1];
                       const timeText = timeEl.textContent.trim();
                       const meetText = cells[2].textContent.trim();
                       const dateText = cells[3].textContent.trim();

                       if (eventText && timeText && timeText !== '-' && /\d/.test(eventText) && /\d/.test(timeText)) {
                         data.push({
                           event: eventText,
                           timeDisplay: timeText,
                           meetName: meetText,
                           date: dateText
                         });
                       }
                     }
                   });
                   return data;
                }
              });

              if (results && results[0] && results[0].result !== null) {
                clearInterval(pollInterval);
                resolve(results[0].result);
              }
            } catch {
              // Ignore errors (e.g., "Cannot access contents of the page" during navigation)
            }
          }, 1000);
        });

        // Silently close the background tab
        chrome.tabs.remove(tabId);

        console.log(`[Cutter Coach Sync] Extracted ${extractedData.length} times from background tab.`);

        sendResponse({ success: true, data: extractedData });

      } catch (e) {
        console.error(`[Cutter Coach Sync] Error:`, e);
        sendResponse({ success: false, error: e.toString() });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
