import type { Env } from "./types"
import { createErrorResponse } from "./utils"
import { corsMiddleware } from "./middleware"
import { handlePosts } from "./handlers/posts"
import { handleCategories } from "./handlers/categories"
import { handleAuthors } from "./handlers/authors"
import { handleComments } from "./handlers/comments"
import { handleMedia } from "./handlers/media"
import { handleAI } from "./handlers/ai"
import { handleSearch } from "./handlers/search"
import { handleAuth } from "./handlers/auth"
import type { ExecutionContext } from "https://deno.land/std@0.166.0/http/server.ts" // Declare ExecutionContext

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight requests
    const corsResponse = await corsMiddleware(request)
    if (corsResponse) return corsResponse

    const url = new URL(request.url)
    const pathname = url.pathname

    try {
      // Health check endpoint
      if (pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      // API Documentation endpoint
      if (pathname === "/api" || pathname === "/api/") {
        return new Response(
          JSON.stringify({
            name: "Blog API",
            version: "1.0.0",
            endpoints: {
              posts: {
                "GET /api/posts": "List all published posts",
                "GET /api/posts/:slug": "Get post by slug",
                "POST /api/posts": "Create new post (admin)",
                "PUT /api/posts/:id": "Update post (admin)",
                "DELETE /api/posts/:id": "Delete post (admin)",
                "POST /api/posts/:id/views": "Increment view count",
              },
              categories: {
                "GET /api/categories": "List all categories",
                "GET /api/categories/:slug/posts": "Get posts by category",
                "POST /api/categories": "Create category (admin)",
                "PUT /api/categories/:id": "Update category (admin)",
                "DELETE /api/categories/:id": "Delete category (admin)",
              },
              authors: {
                "GET /api/authors": "List all authors",
                "GET /api/authors/:id": "Get author details",
                "GET /api/authors/:id/posts": "Get posts by author",
              },
              comments: {
                "GET /api/posts/:id/comments": "Get comments for post",
                "POST /api/posts/:id/comments": "Add new comment",
                "PUT /api/comments/:id/status": "Update comment status (admin)",
                "DELETE /api/comments/:id": "Delete comment (admin)",
              },
              media: {
                "POST /api/media/upload": "Upload media file (admin)",
                "GET /api/media/:key": "Get media file",
                "DELETE /api/media/:key": "Delete media file (admin)",
              },
              search: {
                "GET /api/search": "Search posts",
              },
              ai: {
                "POST /api/ai/generate-excerpt": "Generate post excerpt (admin)",
                "POST /api/ai/generate-tags": "Generate post tags (admin)",
                "POST /api/ai/content-analysis": "Analyze content quality (admin)",
              },
              auth: {
                "POST /api/auth/login": "Admin login",
                "POST /api/auth/register": "Admin registration",
              },
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      // Route to appropriate handlers
      if (pathname.startsWith("/api/posts")) {
        return handlePosts(request, env, pathname)
      }

      if (pathname.startsWith("/api/categories")) {
        return handleCategories(request, env, pathname)
      }

      if (pathname.startsWith("/api/authors")) {
        return handleAuthors(request, env, pathname)
      }

      if (pathname.includes("/comments") || pathname.startsWith("/api/comments")) {
        return handleComments(request, env, pathname)
      }

      if (pathname.startsWith("/api/media")) {
        return handleMedia(request, env, pathname)
      }

      if (pathname.startsWith("/api/ai")) {
        return handleAI(request, env, pathname)
      }

      if (pathname === "/api/search") {
        return handleSearch(request, env)
      }

      if (pathname.startsWith("/api/auth")) {
        return handleAuth(request, env, pathname)
      }

      // 404 for unmatched routes
      return createErrorResponse("Endpoint not found", 404)
    } catch (error) {
      console.error("Unhandled error:", error)
      return createErrorResponse("Internal server error", 500)
    }
  },
}
