import "@testing-library/jest-dom/vitest";

// Tests never talk to real external services.
process.env.AI_PROVIDER = "mock";
process.env.EMBEDDING_PROVIDER = "local";
process.env.STORAGE_PROVIDER = "local";
process.env.LMS_MOCK_MODE = "true";
process.env.SESSION_SECRET ??= "test-session-secret-that-is-long-enough-1234567890";
process.env.INTEGRATION_ENCRYPTION_KEY ??=
  "1111111111111111111111111111111111111111111111111111111111111111";
process.env.DATABASE_URL ??= "postgresql://aihub:aihub@localhost:5432/aihub_test?schema=public";
