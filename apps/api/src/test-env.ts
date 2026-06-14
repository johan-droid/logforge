process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "pg-mem";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
