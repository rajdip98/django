import { defineConfig } from 'vitest/config';

// A DOM environment: several modules read window.location (to resolve the
// subfolder the app is served from) and window.localStorage (for settings).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
