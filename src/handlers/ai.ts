import type { Env } from "../types"
import { createResponse, createErrorResponse, sanitizeInput } from "../utils"
import { adminMiddleware, rateLimitMiddleware } from "../middleware"

export async function handleAI(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method

  // Rate limiting for AI endpoints (more restrictive)
  const rateLimitResponse = await rateLimitMiddleware(request, env, "ai", 10, 3600)
  if (rateLimitResponse) return rateLimitResponse

  if (method === "POST" && pathname === "/api/ai/generate-excerpt") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return generateExcerpt(request, env)
  }

  if (method === "POST" && pathname === "/api/ai/generate-tags") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return generateTags(request, env)
  }

  if (method === "POST" && pathname === "/api/ai/content-analysis") {
    const { response: authResponse } = await adminMiddleware(request, env)
    if (authResponse) return authResponse
    return analyzeContent(request, env)
  }

  return createErrorResponse("Not found", 404)
}

async function generateExcerpt(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { content } = body

    if (!content) {
      return createErrorResponse("Content is required")
    }

    const sanitizedContent = sanitizeInput(content)

    // Truncate content if too long for AI processing
    const truncatedContent = sanitizedContent.substring(0, 2000)

    const prompt = `Generate a compelling excerpt (2-3 sentences, max 150 characters) for this blog post content:\n\n${truncatedContent}`

    const response = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
      messages: [
        {
          role: "system",
          content: "You are a professional content editor. Generate concise, engaging excerpts for blog posts.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const excerpt = (response as any).response?.trim()

    return createResponse({
      success: true,
      data: { excerpt },
      message: "Excerpt generated successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to generate excerpt", 500)
  }
}

async function generateTags(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { title, content } = body

    if (!title && !content) {
      return createErrorResponse("Title or content is required")
    }

    const text = `${title || ""}\n\n${content || ""}`.substring(0, 1500)
    const prompt = `Analyze this blog post and suggest 3-5 relevant tags (single words or short phrases, separated by commas):\n\n${text}`

    const response = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
      messages: [
        {
          role: "system",
          content: "You are a content categorization expert. Generate relevant, concise tags for blog posts.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const tagsText = (response as any).response?.trim()
    const tags =
      tagsText
        ?.split(",")
        .map((tag: string) => tag.trim().toLowerCase())
        .filter((tag: string) => tag.length > 0)
        .slice(0, 5) || []

    return createResponse({
      success: true,
      data: { tags },
      message: "Tags generated successfully",
    })
  } catch (error) {
    return createErrorResponse("Failed to generate tags", 500)
  }
}

async function analyzeContent(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json()
    const { content } = body

    if (!content) {
      return createErrorResponse("Content is required")
    }

    const sanitizedContent = sanitizeInput(content)
    const truncatedContent = sanitizedContent.substring(0, 2000)

    const prompt = `Analyze this blog post content for readability, engagement, and SEO potential. Provide a brief analysis with suggestions:\n\n${truncatedContent}`

    const response = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
      messages: [
        {
          role: "system",
          content: "You are a content quality analyst. Provide constructive feedback on blog posts.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const analysis = (response as any).response?.trim()

    // Simple metrics calculation
    const wordCount = content.split(/\s+/).length
    const readingTime = Math.ceil(wordCount / 200) // Assuming 200 words per minute
    const sentences = content.split(/[.!?]+/).length - 1
    const avgWordsPerSentence = sentences > 0 ? Math.round(wordCount / sentences) : 0

    return createResponse({
      success: true,
      data: {
        analysis,
        metrics: {
          wordCount,
          readingTime,
          sentences,
          avgWordsPerSentence,
        },
      },
      message: "Content analysis completed",
    })
  } catch (error) {
    return createErrorResponse("Failed to analyze content", 500)
  }
}
