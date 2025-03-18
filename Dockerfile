# Базовый образ с зависимостями
FROM node:20-alpine AS deps
WORKDIR /api
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --prefer-offline

# Этап сборки
FROM node:20-alpine AS builder
RUN apk add --no-cache bash netcat-openbsd
WORKDIR /api
COPY --from=deps /api/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Финальный образ
FROM node:20-alpine
RUN apk add --no-cache bash netcat-openbsd
WORKDIR /api
COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api .
RUN sed -i 's/\r$//' wait-for-db.sh && chmod +x wait-for-db.sh

EXPOSE 3000
CMD ["bash", "./wait-for-db.sh"]