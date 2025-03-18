# Базовый образ с зависимостями
FROM node:20-alpine AS deps
WORKDIR /api

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --prefer-offline

# Этап сборки
FROM node:20-alpine AS builder
WORKDIR /api
COPY --from=deps /api/node_modules ./node_modules
COPY . . 

# Генерация Prisma Client
RUN npx prisma generate

# Финальный образ
FROM node:20-alpine
WORKDIR /api
COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api/dist ./dist
COPY package*.json ./

# Установка прав и подготовка скрипта ожидания БД
RUN chmod +x wait-for-db.sh

EXPOSE 3000
CMD ["bash", "./wait-for-db.sh"]
