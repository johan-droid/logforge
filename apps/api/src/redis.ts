import { createRequire } from "node:module";
import Redis from "ioredis";

const require = createRequire(import.meta.url);

type RedisConstructor = typeof Redis;

function getRedisConstructor(): RedisConstructor {
  if (process.env.NODE_ENV !== "test") {
    return Redis;
  }

  const redisMockModule = require("ioredis-mock") as {
    default?: RedisConstructor;
  } & RedisConstructor;

  return redisMockModule.default ?? (redisMockModule as RedisConstructor);
}

export function createRedisClient() {
  const RedisClient = getRedisConstructor();
  return new RedisClient(process.env.REDIS_URL || "redis://localhost:6379", {
    lazyConnect: process.env.NODE_ENV !== "test",
    maxRetriesPerRequest: null,
  });
}
