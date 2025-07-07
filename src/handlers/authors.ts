import type { Env, Author, ApiResponse } from "../types"
import { createResponse, createErrorResponse } from "../utils"
import { rateLimitMiddleware } from "../middleware"

export async function handleAuthors(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "authors", 50)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "GET" && pathname === "/api/authors") {
    return getAuthors(env)
  }

  if (method === "GET" && pathname.startsWith("/api/authors/")) {
    const segments = pathname.split("/")
    const id = Number.parseInt(segments[3])

    if (segments[4] === "posts") {
      return getPostsByAuthor(request, env, id)
    } else {
      return getAuthor(env, id)
    }
  }

  return createErrorResponse("Not found", 404)
}

async function getAuthors(env: Env): Promise<Response> {
  // Check cache first
  const cacheKey = "authors:all"
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return createResponse(JSON.parse(cached))
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT a.*, COUNT(p.id) as post_count 
      FROM authors a 
      LEFT JOIN posts p ON a.id = p.author_id AND p.status = 'published'
      GROUP BY a.id 
      ORDER BY a.name
    `).all()

    const authors = results.map((author: any) => ({
      ...author,
      social_links: author.social_links ? JSON.parse(author.social_links) : {},
    }))

    const response: ApiResponse<Author[]> = {
      success: true,
      data: authors,
    }

    // Cache for 30 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 1800 })

    return createResponse(response)
  } catch (error) {
    return createErrorResponse("Failed to fetch authors", 500)
  }
}

async function getAuthor(env: Env, id: number): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT a.*, COUNT(p.id) as post_count 
      FROM authors a 
      LEFT JOIN posts p ON a.id = p.author_id AND p.status = 'published'
      WHERE a.id = ?
      GROUP BY a.id
    `)
      .bind(id)
      .all()

    if (results.length === 0) {
      return createErrorResponse("Author not found", 404)
    }

    const author = {
      ...results[0],
      social_links: (results[0] as any).social_links ? JSON.parse((results[0] as any).social_links) : {},
    }

    return createResponse({
      success: true,
      data: author,
    })
  } catch (error) {
    return createErrorResponse("Failed to fetch author", 500)
  }
}

async function getPostsByAuthor(request: Request, env: Env, authorId: number): Promise<Response> {
  const url = new URL(request.url)
  const page = Number.parseInt(url.searchParams.get("page") || "1")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") || "10"), 50)
  const offset = (page - 1) * limit

  try {
    const { results } = await env.DB.prepare(`
      SELECT p.*, c.name as category_name, a.name as author_name 
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      JOIN authors a ON p.author_id = a.id 
      WHERE a.id = ? AND p.status = 'published'
      ORDER BY p.published_at DESC 
      LIMIT ? OFFSET ?
    `)
      .bind(authorId, limit, offset)
      .all()

    // Get total count
    const { results: countResults } = await env.DB.prepare(`
      SELECT COUNT(*) as total 
      FROM posts p 
      WHERE p.author_id = ? AND p.status = 'published'
    `)
      .bind(authorId)
      .all()

    const total = (countResults[0] as any).total

    const posts = results.map((post: any) => ({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    }))

    return createResponse({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return createErrorResponse("Failed to fetch posts by author", 500)
  }
}
