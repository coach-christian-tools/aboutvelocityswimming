import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Include archived research pages: third-party credentials must also be redacted.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const exposed = [];
for (const file of files) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue; // Locally deleted tracked files.
    throw error;
  }
  for (const match of content.matchAll(/AIza[0-9A-Za-z_-]{35}/g)) {
    const line = content.slice(0, match.index).split('\n').length;
    exposed.push(`${file}:${line}`);
  }
}
if (exposed.length) {
  // Report locations only; never echo credential values into CI logs.
  console.error('Google API keys detected in tracked files. Redact them before committing:\n' + exposed.join('\n'));
  process.exitCode = 1;
} else {
  console.log('No Google API keys detected in tracked files.');
}
