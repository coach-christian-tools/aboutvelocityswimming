import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { environment: 'node', include: ['tests/swim-resources/firestore.rules.test.ts', 'tests/swim-resources/evidence.rules.test.ts'], fileParallelism: false, hookTimeout: 30000, testTimeout: 30000 } });
