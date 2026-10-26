import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every file shares one local stack, and some tests stop its database, so files run one at a time.
    fileParallelism: false,
  },
});
