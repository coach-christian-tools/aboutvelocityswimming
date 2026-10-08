import { loadEmulatorRules } from './lib/emulator-rules.mjs';
const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1];
await loadEmulatorRules(option('--project'), option('--database'));
console.log('Named demo database rules loaded.');
