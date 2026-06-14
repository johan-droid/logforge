import { createRequire } from "node:module";
import Redis from "ioredis";

const require = createRequire(import.meta.url);

type RedisConstructor = typeof Redis;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

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
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is required to create a Redis client");
  }

  const RedisClient = getRedisConstructor();
  return new RedisClient(process.env.REDIS_URL!, {
    lazyConnect: process.env.NODE_ENV !== "test",
    maxRetriesPerRequest: null,
  });
}
