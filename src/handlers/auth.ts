import type { Env } from "../types"
import { createResponse, createErrorResponse, validateEmail, hashPassword, verifyPassword, generateJWT } from "../utils"
import { rateLimitMiddleware } from "../middleware"

export async function handleAuth(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting for auth endpoints (more restrictive)
  const rateLimitResponse = await rateLimitMiddleware(request, env, "auth", 5, 900) // 5 requests per 15 minutes
  if (rateLimitResponse) return rateLimitResponse

  if (method === "POST" && pathname === "/api/auth/login") {
    return login(request, env)
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    return register(request, env)
  }

  return createErrorResponse("Not found", 404)
}

async function login(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return createErrorResponse("Email and password are required")
    }

    if (!validateEmail(email)) {
      return createErrorResponse("Invalid email address")
    }

    // Find user
    const { results } = await env.DB.prepare("SELECT * FROM admin_users WHERE email = ?").bind(email).all()

    if (results.length === 0) {
      return createErrorResponse("Invalid credentials", 401)
    }

    const user = results[0] as any

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)
    if (!isValidPassword) {
      return createErrorResponse("Invalid credentials", 401)
    }

    // Generate JWT
    const token = await generateJWT({ userId: user.id, email: user.email }, env.JWT_SECRET)

    return createResponse({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      },
      message: "Login successful",
    })
  } catch (error) {
    return createErrorResponse("Login failed", 500)
  }
}

async function register(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return createErrorResponse("Email and password are required")
    }

    if (!validateEmail(email)) {
      return createErrorResponse("Invalid email address")
    }

    if (password.length < 8) {
      return createErrorResponse("Password must be at least 8 characters long")
    }

    // Check if user already exists
    const { results: existingUsers } = await env.DB.prepare("SELECT id FROM admin_users WHERE email = ?")
      .bind(email)
      .all()

    if (existingUsers.length > 0) {
      return createErrorResponse("User already exists", 409)
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Generate API key
    const apiKey = crypto.randomUUID()

    // Create user
    const { results } = await env.DB.prepare(`
      INSERT INTO admin_users (email, password_hash, api_key)
      VALUES (?, ?, ?)
      RETURNING id, email, api_key
    `)
      .bind(email, passwordHash, apiKey)
      .all()

    const user = results[0] as any

    // Generate JWT
    const token = await generateJWT({ userId: user.id, email: user.email }, env.JWT_SECRET)

    return createResponse(
      {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            api_key: user.api_key,
          },
        },
        message: "Registration successful",
      },
      201,
    )
  } catch (error) {
    return createErrorResponse("Registration failed", 500)
  }
}
