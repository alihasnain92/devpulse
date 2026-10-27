import { RATE_LIMIT_HEADERS, RATE_LIMIT_POLICIES } from '@devpulse/shared';

export { RATE_LIMIT_HEADERS, RATE_LIMIT_POLICIES };

/**
 * Atomic sliding window rate limiter implemented in Redis Lua.
 *
 * KEYS[1]: rate limit key, e.g. "rl:user:123:write"
 * ARGV[1]: window size in milliseconds, e.g. 60000
 * ARGV[2]: maximum allowed requests, e.g. 60
 * ARGV[3]: current timestamp in milliseconds, e.g. 1700000000000
 * ARGV[4]: unique request member ID, e.g. "1700000000000-0.12345"
 *
 * Returns an array:
 * [1] allowed (1 = true, 0 = false)
 * [2] currentCount in current window
 * [3] remaining quota
 * [4] resetMs (milliseconds until window resets or oldest slot frees up)
 */
export const SLIDING_WINDOW_LUA_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxLimit = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local memberId = ARGV[4]

local clearBefore = nowMs - windowMs

-- 1. Remove expired request timestamps older than current window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

-- 2. Count current valid requests in the sliding window
local currentCount = redis.call('ZCARD', key)

local allowed = 0
local remaining = 0
local resetMs = windowMs

if currentCount < maxLimit then
  -- Allowed: register this request with current timestamp score
  redis.call('ZADD', key, nowMs, memberId)
  currentCount = currentCount + 1
  allowed = 1
  remaining = maxLimit - currentCount
  -- Refresh expiration on the sorted set
  redis.call('PEXPIRE', key, windowMs + 5000)
else
  -- Rejected: rate limit exceeded
  allowed = 0
  remaining = 0
  -- Find the oldest request score to compute exact remaining wait time
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if oldest and #oldest >= 2 then
    local oldestTime = tonumber(oldest[2])
    resetMs = math.max(1000, (oldestTime + windowMs) - nowMs)
  end
end

return { allowed, currentCount, remaining, resetMs }
`;

/**
 * Atomic multi-key sliding window rate limiter implemented in Redis Lua.
 *
 * Atomically checks all keys and limits before consuming quota on any key.
 * If ANY key has reached its limit:
 *   - Zero keys are modified (no partial or asymmetric consumption).
 *   - Returns allowed = 0, with the blocking key's remaining = 0 and resetMs.
 * If ALL keys are under limit:
 *   - All keys are updated with (nowMs, memberId) and TTL refreshed.
 *   - Returns allowed = 1, minimum remaining across all keys, and resetMs.
 *
 * KEYS: [key1, key2, ...]
 * ARGV[1]: windowMs
 * ARGV[2]: nowMs
 * ARGV[3]: memberId
 * ARGV[4...]: limits corresponding to each key [limit1, limit2, ...]
 */
export const MULTI_KEY_SLIDING_WINDOW_LUA_SCRIPT = `
local windowMs = tonumber(ARGV[1])
local nowMs = tonumber(ARGV[2])
local memberId = ARGV[3]
local numKeys = #KEYS
local clearBefore = nowMs - windowMs

-- 1. Pass 1: Prune expired entries and verify limit for ALL keys
for i = 1, numKeys do
  local key = KEYS[i]
  local maxLimit = tonumber(ARGV[3 + i])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
  local currentCount = redis.call('ZCARD', key)

  if currentCount >= maxLimit then
    -- Key limit reached: compute exact reset wait time for the blocking key
    local resetMs = windowMs
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest and #oldest >= 2 then
      local oldestTime = tonumber(oldest[2])
      resetMs = math.max(1000, (oldestTime + windowMs) - nowMs)
    end
    -- Atomic abort: no key was modified, preventing asymmetric quota depletion
    return { 0, currentCount, 0, resetMs, i }
  end
end

-- 2. Pass 2: All keys verified under limit -> consume quota on all keys atomically
local minRemaining = 999999
for i = 1, numKeys do
  local key = KEYS[i]
  local maxLimit = tonumber(ARGV[3 + i])
  redis.call('ZADD', key, nowMs, memberId)
  redis.call('PEXPIRE', key, windowMs + 5000)
  local currentCount = redis.call('ZCARD', key)
  local remaining = math.max(0, maxLimit - currentCount)
  if remaining < minRemaining then
    minRemaining = remaining
  end
end

return { 1, 0, minRemaining, windowMs, 0 }
`;
