# Stage 1: Install ALL dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ postgresql-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the app
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ postgresql-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (show output for debugging)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat postgresql-client
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/package.json ./

# Copy node_modules (needed for pg native bindings)
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
