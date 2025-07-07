# Cloudflare Blog API

A comprehensive, production-ready Cloudflare Worker backend API for a public blog application built with TypeScript.

## Features

- **Full REST API** for blog management (posts, categories, authors, comments)
- **D1 Database** for data persistence with optimized queries
- **R2 Object Storage** for media file management
- **KV Store** for caching and session management
- **Cloudflare AI** integration for content enhancement
- **JWT Authentication** with admin role management
- **Rate Limiting** and security features
- **Full-text search** capabilities
- **Comprehensive caching** strategy
- **File upload** with validation and optimization
- **AI-powered** content generation and analysis

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers, D1, R2, and KV enabled
- Wrangler CLI installed globally: `npm install -g wrangler`

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd cloudflare-blog-api
   npm install
   ```

2. **Create Cloudflare resources:**
   ```bash
   # Create D1 database
   npm run db:create
   
   # Create KV namespace
   npm run kv:create
   
   # Create R2 bucket
   npm run r2:create
   ```

3. **Update wrangler.toml** with your resource IDs from the previous step.

4. **Set up environment variables:**
   Create a `.dev.vars` file:
   ```
   JWT_SECRET=your-super-secret-jwt-key
   ADMIN_API_KEY=your-admin-api-key
   ```

5. **Initialize database:**
   ```bash
   npm run db:migrate:local  # For local development
   npm run db:migrate        # For production
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Posts
- `GET /api/posts` - List published posts (with pagination, search, filtering)
- `GET /api/posts/:slug` - Get single post by slug
- `POST /api/posts` - Create new post (admin only)
- `PUT /api/posts/:id` - Update post (admin only)
- `DELETE /api/posts/:id` - Delete post (admin only)
- `POST /api/posts/:id/views` - Increment view count

### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:slug/posts` - Get posts by category
- `POST /api/categories` - Create category (admin only)
- `PUT /api/categories/:id` - Update category (admin only)
- `DELETE /api/categories/:id` - Delete category (admin only)

### Authors
- `GET /api/authors` - List all authors
- `GET /api/authors/:id` - Get author details
- `GET /api/authors/:id/posts` - Get posts by author

### Comments
- `GET /api/posts/:id/comments` - Get approved comments for a post
- `POST /api/posts/:id/comments` - Submit new comment
- `PUT /api/comments/:id/status` - Update comment status (admin only)
- `DELETE /api/comments/:id` - Delete comment (admin only)

### Media
- `POST /api/media/upload` - Upload media files (admin only)
- `GET /api/media/:key` - Retrieve media file
- `DELETE /api/media/:key` - Delete media file (admin only)

### Search & AI
- `GET /api/search?q=query` - Search posts with full-text search
- `POST /api/ai/generate-excerpt` - Generate post excerpt using AI (admin only)
- `POST /api/ai/generate-tags` - Generate tags for post using AI (admin only)
- `POST /api/ai/content-analysis` - Analyze content quality (admin only)

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/register` - Admin registration

## Authentication

The API supports two authentication methods:

1. **JWT Tokens**: Include in Authorization header as `Bearer <token>`
2. **API Keys**: Include in X-API-Key header

Admin endpoints require authentication. Public endpoints (reading posts, comments) don't require authentication.

## Rate Limiting

- General endpoints: 100 requests/hour per IP
- Auth endpoints: 5 requests/15 minutes per IP
- AI endpoints: 10 requests/hour per IP
- Media uploads: 20 requests/hour per IP

## Caching Strategy

- **Posts**: Cached for 5-10 minutes
- **Categories/Authors**: Cached for 30 minutes
- **Search results**: Cached for 5 minutes
- **Media files**: Cached for 1 year with ETags

## Database Schema

The API uses the following main tables:
- `posts` - Blog posts with metadata
- `categories` - Post categories
- `authors` - Author information
- `comments` - User comments on posts
- `admin_users` - Admin user accounts

## Security Features

- Input sanitization and validation
- SQL injection prevention
- XSS protection
- CORS configuration
- Rate limiting per IP
- JWT token expiration
- File upload validation
- Content moderation for comments

## Deployment

### Staging
```bash
npm run deploy:staging
```

### Production
```bash
npm run deploy:production
```

## Environment Variables

Required environment variables:
- `JWT_SECRET` - Secret key for JWT token signing
- `ADMIN_API_KEY` - Master API key for admin access

## Development

### Local Development
```bash
npm run dev
```

### Database Migrations
```bash
npm run db:migrate:local  # Local
npm run db:migrate        # Remote
```

### Monitoring
```bash
npm run tail  # View real-time logs
```

## API Usage Examples

### Create a Post
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/posts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "This is the content of my first post...",
    "status": "published",
    "category_id": 1,
    "author_id": 1,
    "tags": ["technology", "web development"]
  }'
```

### Search Posts
```bash
curl "https://your-worker.your-subdomain.workers.dev/api/search?q=javascript&page=1&limit=10"
```

### Upload Media
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/media/upload \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@image.jpg"
```

## Performance Considerations

- Uses prepared statements for all database queries
- Implements comprehensive caching at multiple levels
- Optimized database indexes for common queries
- Efficient pagination for large datasets
- CDN-friendly media serving with proper cache headers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
