/**
 * In-memory rate limiter for API routes.
 * Works on Vercel serverless (per-instance limiting).
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 })
 *   // In route handler:
 *   const rl = limiter.check(userEmail)
 *   if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 })
 */

interface RateLimitConfig {
  /** Max requests allowed in the time window */
  maxRequests: number
  /** Time window in milliseconds */
  windowMs: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitResult {
  ok: boolean
  remaining: number
  error?: string
  retryAfterMs?: number
}

/**
 * Create a rate limiter instance with configurable limits.
 * Each instance maintains its own in-memory store.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>()

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const CLEANUP_INTERVAL = 5 * 60_000
  let lastCleanup = Date.now()

  function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
    // Safety: cap store size to 10K entries
    if (store.size > 10_000) store.clear()
  }

  return {
    check(identifier: string): RateLimitResult {
      cleanup()

      const now = Date.now()
      const entry = store.get(identifier)

      // No entry or window expired → allow
      if (!entry || now > entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + config.windowMs })
        return { ok: true, remaining: config.maxRequests - 1 }
      }

      // Within window → check count
      if (entry.count >= config.maxRequests) {
        const retryAfterMs = entry.resetAt - now
        return {
          ok: false,
          remaining: 0,
          retryAfterMs,
          error: `Trop de requêtes. Réessayez dans ${Math.ceil(retryAfterMs / 1000)}s.`,
        }
      }

      // Increment
      entry.count++
      return { ok: true, remaining: config.maxRequests - entry.count }
    },
  }
}

// ─── Pre-configured limiters by tier ────────────────────────────────

/** TIER 1 — Critical: AI endpoints (5 req/min) */
export const aiLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })

/** TIER 2 — High: File ops, exports, Excel (20 req/min) */
export const fileLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 })

/** TIER 3 — Medium: Analytics, read-heavy (30 req/min) */
export const analyticsLimiter = createRateLimiter({ maxRequests: 30, windowMs: 60_000 })

/** TIER 4 — Migration: very restrictive (2 req/min) */
export const migrateLimiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 })
