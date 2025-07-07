import type { Env, Category, ApiResponse } from "../types"
import { createResponse, createErrorResponse, generateSlug } from "../utils"
import { adminMiddleware, rateLimitMiddleware } from "../middleware"

export async function handleCategories(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(request, env, "categories", 50)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "GET" && pathname === "/api/categories") {
    return getCategories(env)
  }

  if (method === "GET" && pathname.startsWith("/api/categories/") && pathname.endsWith("/posts")) {
    const slug = pathname.split("/")[3]
    return getPostsByCategory(request, env, slug)
  }

  if (method === "POST" && pathname === "/api/categories") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return createCategory(request, env)
  }

  if (method === "PUT" && pathname.startsWith("/api/categories/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return updateCategory(request, env, id)
  }

  if (method === "DELETE" && pathname.startsWith("/api/categories/")) {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    const id = Number.parseInt(pathname.split("/")[3])
    return deleteCategory(env, id)
  }

  return createErrorResponse("Not found", 404)
}

async function getCategories(env: Env): Promise<Response> {
  // Check cache first
  const cacheKey = "categories:all"
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return createResponse(JSON.parse(cached))
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT c.*, COUNT(p.id) as post_count 
      FROM categories c 
      LEFT JOIN posts p ON c.id = p.category_id AND p.status = 'published'
      GROUP BY c.id 
      ORDER BY c.name
    `).all()

    const response: ApiResponse<Category[]> = {
      success: true,
      data: results as Category[],
    }

    // Cache for 30 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 1800 })

    return createResponse(response)
  } catch (error) {
    return createErrorResponse("Failed to fetch categories", 500)
  }
}

async function getPostsByCategory(request: Request, env: Env, slug: string): Promise<Response> {
  const url = new URL(request.url)
  const page = Number.parseInt(url.searchParams.get("page") || "1")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") || "10"), 50)
  const offset = (page - 1) * limit

  try {
    const { results } = await env.DB.prepare(`
      SELECT p.*, c.name as category_name, a.name as author_name 
      FROM posts p 
      JOIN categories c ON p.category_id = c.id 
      LEFT JOIN authors a ON p.author_id = a.id 
      WHERE c.slug = ? AND p.status = 'published'
      ORDER BY p.published_at DESC 
      LIMIT ? OFFSET ?
    `)
      .bind(slug, limit, offset)
      .all()

    // Get total count
    const { results: countResults } = await env.DB.prepare(`
      SELECT COUNT(*) as total 
      FROM posts p 
      JOIN categories c ON p.category_id = c.id 
      WHERE c.slug = ? AND p.status = 'published'
    `)
      .bind(slug)
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
    return createErrorResponse("Failed to fetch posts by category", 500)
  }
}

async function createCategory(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return createErrorResponse("Name is required")
    }

    const slug = generateSlug(name)

    const { results } = await env.DB.prepare(`
      INSERT INTO categories (name, slug, description)
      VALUES (?, ?, ?)
      RETURNING *
    `)
      .bind(name, slug, description)
      .all()

    // Invalidate cache
    await env.CACHE.delete("categories:all")

    return createResponse(
      {
        success: true,
        data: results[0],
        message: "Category created successfully",
      },
      201,
    )
  } catch (error) {
    return createErrorResponse("Failed to create category", 500)
  }
}

async function updateCategory(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const body = await request.json()
    const { name, description } = body

    const updates: string[] = []
    const params: any[] = []

    if (name) {
      updates.push("name = ?", "slug = ?")
      params.push(name, generateSlug(name))
    }
    if (description !== undefined) {
      updates.push("description = ?")
      params.push(description)
    }

    if (updates.length === 0) {
      return createErrorResponse("No fields to update")
    }

    params.push(id)

    const { results } = await env.DB.prepare(`
      UPDATE categories SET ${updates.join(", ")} WHERE id = ? RETURNING *
    `)
      .bind(...params)
      .all()

    if (results.length === 0) {
      return createErrorResponse("Category not found", 404)
    }

    // Invalidate cache
    await env.CACHE.delete("categories:all")

    return createResponse({
      success: true,
      data: results[0],
      message: "Category updated successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to update category", 500)
  }
}

async function deleteCategory(env: Env, id: number): Promise<Response> {
  try {
    const { results } = await env.DB.prepare("DELETE FROM categories WHERE id = ? RETURNING *").bind(id).all()

    if (results.length === 0) {
      return createErrorResponse("Category not found", 404)
    }

    // Invalidate cache
    await env.CACHE.delete("categories:all")

    return createResponse({
      success: true,
      message: "Category deleted successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to delete category", 500)
  }
}
