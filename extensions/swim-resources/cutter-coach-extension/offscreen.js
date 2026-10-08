chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PARSE_HTML') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message.html, 'text/html');
    const results = [];

    // Swimcloud times are typically in tables. 
    // We look for any row where the first column contains event-like text and the second contains a time.
    const rows = doc.querySelectorAll('table tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const eventText = cells[0].textContent.trim();
        const timeEl = cells[1].querySelector('a') || cells[1];
        const timeText = timeEl.textContent.trim();
        const meetText = cells[2].textContent.trim();
        const dateText = cells[3].textContent.trim();

        // Basic validation: event must have a number (e.g. 50, 100), time must have a number
        if (eventText && timeText && timeText !== '-' && /\d/.test(eventText) && /\d/.test(timeText)) {
          results.push({
            event: eventText,
            timeDisplay: timeText,
            meetName: meetText,
            date: dateText
          });
        }
      }
    });

    sendResponse({ data: results });
  }
});
