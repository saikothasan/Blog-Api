import type { Env } from "../types"
import { createResponse, createErrorResponse, validateEmail, sanitizeInput } from "../utils"
import { adminMiddleware, rateLimitMiddleware } from "../middleware"

export async function handleComments(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "comments", 30)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "GET" && pathname.includes("/comments")) {
    const postId = Number.parseInt(pathname.split("/")[3])
    return getCommentsByPost(request, env, postId)
  }

  if (method === "POST" && pathname.includes("/comments")) {
    const postId = Number.parseInt(pathname.split("/")[3])
    return createComment(request, env, postId)
  }

  if (method === "PUT" && pathname.startsWith("/api/comments/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return updateCommentStatus(request, env, id)
  }

  if (method === "DELETE" && pathname.startsWith("/api/comments/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return deleteComment(env, id)
  }

  return createErrorResponse("Not found", 404)
}

async function getCommentsByPost(request: Request, env: Env, postId: number): Promise<Response> {
  const url = new URL(request.url)
  const page = Number.parseInt(url.searchParams.get("page") || "1")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") || "20"), 100)
  const offset = (page - 1) * limit

  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM comments 
      WHERE post_id = ? AND status = 'approved'
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `)
      .bind(postId, limit, offset)
      .all()

    // Get total count
    const { results: countResults } = await env.DB.prepare(`
      SELECT COUNT(*) as total 
      FROM comments 
      WHERE post_id = ? AND status = 'approved'
    `)
      .bind(postId)
      .all()

    const total = (countResults[0] as any).total

    return createResponse({
      success: true,
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return createErrorResponse("Failed to fetch comments", 500)
  }
}

async function createComment(request: Request, env: Env, postId: number): Promise<Response> {
  try {
    const body = await request.json()
    const { author_name, author_email, content } = body

    if (!author_name || !author_email || !content) {
      return createErrorResponse("Name, email, and content are required")
    }

    if (!validateEmail(author_email)) {
      return createErrorResponse("Invalid email address")
    }

    // Check if post exists
    const { results: postResults } = await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).all()
    if (postResults.length === 0) {
      return createErrorResponse("Post not found", 404)
    }

    const sanitizedContent = sanitizeInput(content)

    // Simple spam detection (you might want to integrate with AI for better detection)
    const isSpam = content.toLowerCase().includes("spam") || content.includes("http://") || content.includes("https://")
    const status = isSpam ? "spam" : "pending"

    const { results } = await env.DB.prepare(`
      INSERT INTO comments (post_id, author_name, author_email, content, status)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(postId, author_name, author_email, sanitizedContent, status)
      .all()

    return createResponse(
      {
        success: true,
        data: results[0],
        message: "Comment submitted for review",
      },
      201,
    )
  } catch (error) {
    return createErrorResponse("Failed to create comment", 500)
  }
}

async function updateCommentStatus(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const body = await request.json()
    const { status } = body

    if (!["pending", "approved", "spam"].includes(status)) {
      return createErrorResponse("Invalid status")
    }

    const { results } = await env.DB.prepare(`
      UPDATE comments SET status = ? WHERE id = ? RETURNING *
    `)
      .bind(status, id)
      .all()

    if (results.length === 0) {
      return createErrorResponse("Comment not found", 404)
    }

    return createResponse({
      success: true,
      data: results[0],
      message: "Comment status updated",
    })
  } catch (error) {
    return createErrorResponse("Failed to update comment status", 500)
  }
}

async function deleteComment(env: Env, id: number): Promise<Response> {
  try {
    const { results } = await env.DB.prepare("DELETE FROM comments WHERE id = ? RETURNING *").bind(id).all()

    if (results.length === 0) {
      return createErrorResponse("Comment not found", 404)
    }

    return createResponse({
      success: true,
      message: "Comment deleted successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to delete comment", 500)
  }
}
