FROM node:22-alpine

RUN apk add --no-cache python3 make g++ postgresql-dev

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy app
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
