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
CMD ["sh", "-c", "for i in 1 2 3 4 5 6 7 8 9 10; do echo \"[boot] db push tentativa $i\"; npx prisma db push --skip-generate --accept-data-loss >> /tmp/dbpush.log 2>&1 && break; sleep 5; done; tail -5 /tmp/dbpush.log; npm start"]
