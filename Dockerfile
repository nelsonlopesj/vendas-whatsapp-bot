FROM node:22-alpine
RUN apk add --no-cache python3 make g++ postgresql-dev curl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
# db push no boot: aplica colunas novas do schema automaticamente
# (evita quebra de páginas quando o banco está atrasado em relação ao código)
# Melhor-esforço: se falhar, loga em /tmp/dbpush.log e o app sobe mesmo assim
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss > /tmp/dbpush.log 2>&1 || echo 'db push skipped (see /tmp/dbpush.log)'; npm start"]
