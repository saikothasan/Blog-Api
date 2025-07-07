import type { Env } from "../types"
import { createResponse, createErrorResponse } from "../utils"
import { adminMiddleware, rateLimitMiddleware } from "../middleware"

export async function handleMedia(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "media", 20)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "POST" && pathname === "/api/media/upload") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return uploadMedia(request, env)
  }

  if (method === "GET" && pathname.startsWith("/api/media/")) {
    const key = pathname.split("/")[3]
    return getMedia(env, key)
  }

  if (method === "DELETE" && pathname.startsWith("/api/media/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const key = pathname.split("/")[3]
    return deleteMedia(env, key)
  }

  return createErrorResponse("Not found", 404)
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return createErrorResponse("No file provided")
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return createErrorResponse("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed")
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return createErrorResponse("File too large. Maximum size is 5MB")
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 15)
    const extension = file.name.split(".").pop()
    const key = `uploads/${timestamp}-${randomString}.${extension}`

    // Upload to R2
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    })

    // Generate public URL (you might want to use a custom domain)
    const url = `https://your-bucket.your-account.r2.cloudflarestorage.com/${key}`

    return createResponse(
      {
        success: true,
        data: {
          key,
          url,
          filename: file.name,
          size: file.size,
          type: file.type,
        },
        message: "File uploaded successfully",
      },
      201,
    )
  } catch (error) {
    return createErrorResponse("Failed to upload file", 500)
  }
}

async function getMedia(env: Env, key: string): Promise<Response> {
  try {
    const object = await env.BUCKET.get(key)

    if (!object) {
      return createErrorResponse("File not found", 404)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("cache-control", "public, max-age=31536000") // Cache for 1 year

    return new Response(object.body, {
      headers,
    })
  } catch (error) {
    return createErrorResponse("Failed to retrieve file", 500)
  }
}

async function deleteMedia(env: Env, key: string): Promise<Response> {
  try {
    await env.BUCKET.delete(key)

    return createResponse({
      success: true,
      message: "File deleted successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to delete file", 500)
  }
}
