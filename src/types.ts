import type { D1Database } from "@cloudflare/workers-types"
import type { R2Bucket } from "@cloudflare/workers-types"
import type { KVNamespace } from "@cloudflare/workers-types"
import type { Ai } from "./path-to-ai-module" // Assuming Ai is imported from a module

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  CACHE: KVNamespace
  AI: Ai
  JWT_SECRET: string
  ADMIN_API_KEY: string
}

export interface Post {
  id: number
  title: string
  slug: string
  content: string
  excerpt?: string
  featured_image?: string
  status: "draft" | "published" | "archived"
  author_id?: number
  category_id?: number
  tags?: string[]
  meta_description?: string
  meta_keywords?: string
  view_count: number
  created_at: string
  updated_at: string
  published_at?: string
}

export interface Category {
  id: number
  name: string
  slug: string
  description?: string
  created_at: string
}

export interface Author {
  id: number
  name: string
  email: string
  bio?: string
  avatar_url?: string
  social_links?: Record<string, string>
  created_at: string
}

export interface Comment {
  id: number
  post_id: number
  author_name: string
  author_email: string
  content: string
  status: "pending" | "approved" | "spam"
  created_at: string
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface JWTPayload {
  userId: number
  email: string
  exp: number
}
