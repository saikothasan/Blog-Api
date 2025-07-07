import type { Env, Post, ApiResponse } from "../types"
import { createResponse, createErrorResponse } from "../utils"
import { rateLimitMiddleware } from "../middleware"

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "search", 50)
  if (rateLimitResponse) return rateLimitResponse

  const url = new URL(request.url)
  const query = url.searchParams.get("q")
  const page = Number.parseInt(url.searchParams.get("page") || "1")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") || "10"), 50)
  const category = url.searchParams.get("category")
  const author = url.searchParams.get("author")
  const offset = (page - 1) * limit

  if (!query) {
    return createErrorResponse("Search query is required")
  }

  // Check cache first
  const cacheKey = `search:${query}:${page}:${limit}:${category || ""}:${author || ""}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return createResponse(JSON.parse(cached))
  }

  try {
    let searchQuery = `
      SELECT p.*, c.name as category_name, a.name as author_name,
             (CASE 
               WHEN p.title LIKE ? THEN 3
               WHEN p.excerpt LIKE ? THEN 2
               WHEN p.content LIKE ? THEN 1
               ELSE 0
             END) as relevance_score
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN authors a ON p.author_id = a.id 
      WHERE p.status = 'published' 
      AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ? OR p.tags LIKE ?)
    `

    const searchTerm = `%${query}%`
    const params: any[] = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]

    if (category) {
      searchQuery += ` AND c.slug = ?`
      params.push(category)
    }

    if (author) {
      searchQuery += ` AND a.id = ?`
      params.push(Number.parseInt(author))
    }

    searchQuery += ` ORDER BY relevance_score DESC, p.published_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const { results } = await env.DB.prepare(searchQuery)
      .bind(...params)
      .all()

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN authors a ON p.author_id = a.id 
      WHERE p.status = 'published' 
      AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ? OR p.tags LIKE ?)
    `

    const countParams: any[] = [searchTerm, searchTerm, searchTerm, searchTerm]

    if (category) {
      countQuery += ` AND c.slug = ?`
      countParams.push(category)
    }

    if (author) {
      countQuery += ` AND a.id = ?`
      countParams.push(Number.parseInt(author))
    }

    const { results: countResults } = await env.DB.prepare(countQuery)
      .bind(...countParams)
      .all()
    const total = (countResults[0] as any).total

    const posts = results.map((post: any) => ({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    }))

    const response: ApiResponse<Post[]> = {
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }

    // Cache search results for 5 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 300 })

    return createResponse(response)
  } catch (error) {
    return createErrorResponse("Search failed", 500)
  }
}
