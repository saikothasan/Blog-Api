import type { Env, JWTPayload } from "./types"
import { createErrorResponse, verifyJWT, extractBearerToken } from "./utils"

export async function rateLimitMiddleware(
  request: Request,
  env: Env,
  key: string,
  limit = 100,
  window = 3600,
): Promise<Response | null> {
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown"
  const rateLimitKey = `rate_limit:${key}:${clientIP}`

  const current = await env.CACHE.get(rateLimitKey)
  const count = current ? Number.parseInt(current) : 0

  if (count >= limit) {
    return createErrorResponse("Rate limit exceeded", 429)
  }

  await env.CACHE.put(rateLimitKey, (count + 1).toString(), { expirationTtl: window })
  return null
}

export async function authMiddleware(request: Request, env: Env): Promise<{ response?: Response; user?: JWTPayload }> {
  const authHeader = request.headers.get("Authorization")
  const token = extractBearerToken(authHeader)

  if (!token) {
    return { response: createErrorResponse("Authorization token required", 401) }
  }

  const user = await verifyJWT(token, env.JWT_SECRET)
  if (!user) {
    return { response: createErrorResponse("Invalid or expired token", 401) }
  }

  return { user }
}

export async function adminMiddleware(request: Request, env: Env): Promise<{ response?: Response; user?: JWTPayload }> {
  // Check for API key first
  const apiKey = request.headers.get("X-API-Key")
  if (apiKey === env.ADMIN_API_KEY) {
    return {} // Admin API key is valid
  }

  // Otherwise check JWT
  return authMiddleware(request, env)
}

export async function corsMiddleware(request: Request): Promise<Response | null> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
        "Access-Control-Max-Age": "86400",
      },
    })
  }
  return null
}
