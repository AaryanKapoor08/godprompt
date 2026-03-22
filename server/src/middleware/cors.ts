// CORS middleware — scoped to extension origin in production

import { cors } from 'hono/cors'

const allowedOrigins = process.env.ALLOWED_ORIGINS ?? '*'

export const corsMiddleware = cors({
  origin: allowedOrigins === '*'
    ? '*'
    : allowedOrigins.split(',').map((o) => o.trim()),
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
})
