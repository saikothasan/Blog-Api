import type { Env, Post, ApiResponse } from "../types"
import { createResponse, createErrorResponse, generateSlug, sanitizeInput } from "../utils"
import { adminMiddleware, rateLimitMiddleware } from "../middleware"

export async function handlePosts(request: Request, env: Env, pathname: string): Promise<Response> {
  const url = new URL(request.url)
  const method = request.method

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "posts", 100)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "GET" && pathname === "/api/posts") {
    return getPublishedPosts(request, env)
  }

  if (method === "GET" && pathname.startsWith("/api/posts/")) {
    const slug = pathname.split("/")[3]
    if (slug && !slug.includes("/")) {
      return getPostBySlug(slug, env)
    }
  }

  if (method === "POST" && pathname === "/api/posts") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return createPost(request, env)
  }

  if (method === "PUT" && pathname.startsWith("/api/posts/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return updatePost(request, env, id)
  }

  if (method === "DELETE" && pathname.startsWith("/api/posts/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return deletePost(env, id)
  }

  if (method === "POST" && pathname.includes("/views")) {
    const id = Number.parseInt(pathname.split("/")[3])
    return incrementViews(env, id)
  }

  return createErrorResponse("Not found", 404)
}

async function getPublishedPosts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const page = Number.parseInt(url.searchParams.get("page") || "1")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") || "10"), 50)
  const search = url.searchParams.get("search")
  const category = url.searchParams.get("category")
  const author = url.searchParams.get("author")
  const offset = (page - 1) * limit

  // Check cache first
  const cacheKey = `posts:${page}:${limit}:${search || ""}:${category || ""}:${author || ""}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return createResponse(JSON.parse(cached))
  }

  let query = `
    SELECT p.*, c.name as category_name, a.name as author_name 
    FROM posts p 
    LEFT JOIN categories c ON p.category_id = c.id 
    LEFT JOIN authors a ON p.author_id = a.id 
    WHERE p.status = 'published'
  `

  const params: any[] = []

  if (search) {
    query += ` AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)`
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  if (category) {
    query += ` AND c.slug = ?`
    params.push(category)
  }

  if (author) {
    query += ` AND a.id = ?`
    params.push(Number.parseInt(author))
  }

  query += ` ORDER BY p.published_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  try {
    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all()

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM posts p WHERE p.status = 'published'`
    const countParams: any[] = []

    if (search) {
      countQuery += ` AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    if (category) {
      countQuery += ` AND EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.slug = ?)`
      countParams.push(category)
    }

    if (author) {
      countQuery += ` AND p.author_id = ?`
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

    // Cache for 5 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 300 })

    return createResponse(response)
  } catch (error) {
    return createErrorResponse("Failed to fetch posts", 500)
  }
}

async function getPostBySlug(slug: string, env: Env): Promise<Response> {
  // Check cache first
  const cacheKey = `post:${slug}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return createResponse(JSON.parse(cached))
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT p.*, c.name as category_name, a.name as author_name, a.bio as author_bio, a.avatar_url as author_avatar
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN authors a ON p.author_id = a.id 
      WHERE p.slug = ? AND p.status = 'published'
    `)
      .bind(slug)
      .all()

    if (results.length === 0) {
      return createErrorResponse("Post not found", 404)
    }

    const post = {
      ...results[0],
      tags: (results[0] as any).tags ? JSON.parse((results[0] as any).tags) : [],
    }

    const response: ApiResponse<Post> = {
      success: true,
      data: post as Post,
    }

    // Cache for 10 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 600 })

    return createResponse(response)
  } catch (error) {
    return createErrorResponse("Failed to fetch post", 500)
  }
}

async function createPost(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const {
      title,
      content,
      excerpt,
      featured_image,
      category_id,
      author_id,
      tags,
      meta_description,
      meta_keywords,
      status = "draft",
    } = body

    if (!title || !content) {
      return createErrorResponse("Title and content are required")
    }

    const slug = generateSlug(title)
    const sanitizedContent = sanitizeInput(content)
    const sanitizedExcerpt = excerpt ? sanitizeInput(excerpt) : null

    const published_at = status === "published" ? new Date().toISOString() : null

    const { results } = await env.DB.prepare(`
      INSERT INTO posts (title, slug, content, excerpt, featured_image, category_id, author_id, tags, meta_description, meta_keywords, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        title,
        slug,
        sanitizedContent,
        sanitizedExcerpt,
        featured_image,
        category_id,
        author_id,
        tags ? JSON.stringify(tags) : null,
        meta_description,
        meta_keywords,
        status,
        published_at,
      )
      .all()

    // Invalidate cache
    await invalidatePostsCache(env)

    return createResponse(
      {
        success: true,
        data: results[0],
        message: "Post created successfully",
      },
      201,
    )
  } catch (error) {
    return createErrorResponse("Failed to create post", 500)
  }
}

async function updatePost(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const body = await request.json()
    const {
      title,
      content,
      excerpt,
      featured_image,
      category_id,
      author_id,
      tags,
      meta_description,
      meta_keywords,
      status,
    } = body

    const slug = title ? generateSlug(title) : undefined
    const sanitizedContent = content ? sanitizeInput(content) : undefined
    const sanitizedExcerpt = excerpt ? sanitizeInput(excerpt) : undefined

    // Build dynamic update query
    const updates: string[] = []
    const params: any[] = []

    if (title) {
      updates.push("title = ?")
      params.push(title)
    }
    if (slug) {
      updates.push("slug = ?")
      params.push(slug)
    }
    if (content) {
      updates.push("content = ?")
      params.push(sanitizedContent)
    }
    if (excerpt !== undefined) {
      updates.push("excerpt = ?")
      params.push(sanitizedExcerpt)
    }
    if (featured_image !== undefined) {
      updates.push("featured_image = ?")
      params.push(featured_image)
    }
    if (category_id !== undefined) {
      updates.push("category_id = ?")
      params.push(category_id)
    }
    if (author_id !== undefined) {
      updates.push("author_id = ?")
      params.push(author_id)
    }
    if (tags !== undefined) {
      updates.push("tags = ?")
      params.push(JSON.stringify(tags))
    }
    if (meta_description !== undefined) {
      updates.push("meta_description = ?")
      params.push(meta_description)
    }
    if (meta_keywords !== undefined) {
      updates.push("meta_keywords = ?")
      params.push(meta_keywords)
    }
    if (status) {
      updates.push("status = ?")
      params.push(status)
      if (status === "published") {
        updates.push("published_at = ?")
        params.push(new Date().toISOString())
      }
    }

    updates.push("updated_at = ?")
    params.push(new Date().toISOString())
    params.push(id)

    if (updates.length === 1) {
      // Only updated_at
      return createErrorResponse("No fields to update")
    }

    const query = `UPDATE posts SET ${updates.join(", ")} WHERE id = ? RETURNING *`
    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all()

    if (results.length === 0) {
      return createErrorResponse("Post not found", 404)
    }

    // Invalidate cache
    await invalidatePostsCache(env)

    return createResponse({
      success: true,
      data: results[0],
      message: "Post updated successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to update post", 500)
  }
}

async function deletePost(env: Env, id: number): Promise<Response> {
  try {
    const { results } = await env.DB.prepare("DELETE FROM posts WHERE id = ? RETURNING *").bind(id).all()

    if (results.length === 0) {
      return createErrorResponse("Post not found", 404)
    }

    // Invalidate cache
    await invalidatePostsCache(env)

    return createResponse({
      success: true,
      message: "Post deleted successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to delete post", 500)
  }
}

async function incrementViews(env: Env, id: number): Promise<Response> {
  try {
    await env.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(id).run()

    return createResponse({
      success: true,
      message: "View count incremented",
    })
  } catch (error) {
    return createErrorResponse("Failed to increment views", 500)
  }
}

async function invalidatePostsCache(env: Env): Promise<void> {
  // In a real implementation, you might want to keep track of cache keys
  // For now, we'll just delete some common patterns
  const keys = ["posts:1:10:::", "posts:1:20:::", "posts:2:10:::"]
  await Promise.all(keys.map((key) => env.CACHE.delete(key)))
}
