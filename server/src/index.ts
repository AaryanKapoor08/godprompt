// PromptPilot backend server — Hono on Node.js
// Proxies LLM calls for free-tier users with rate limiting and validation

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { corsMiddleware } from './middleware/cors'
import { enhance } from './routes/enhance'

const app = new Hono()

// Global middleware
app.use('*', corsMiddleware)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// API routes
app.route('/api/enhance', enhance)

// Start server
const PORT = parseInt(process.env.PORT ?? '3000', 10)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.info(`[PromptPilot] Server running on http://localhost:${info.port}`)
})

// Export for testing
export { app }
