# Используем Node.js 20 на Alpine Linux
FROM node:20-alpine AS deps
WORKDIR /api

# Устанавливаем NestJS CLI
RUN npm install -g @nestjs/cli@latest

# Копируем файлы зависимостей и устанавливаем зависимости
COPY package*.json ./
RUN npm install --omit=dev --prefer-offline

# Этап сборки
FROM node:20-alpine AS builder
WORKDIR /api
COPY --from=deps /api/node_modules ./node_modules
COPY . .

# Генерируем Prisma Client
RUN npx prisma generate

# Финальный образ
FROM node:20-alpine
WORKDIR /api
COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api/dist ./dist
COPY package*.json ./

# Устанавливаем зависимости (если что-то потерялось при копировании)
RUN npm install --omit=dev --prefer-offline

# Открываем порт и запускаем приложение
EXPOSE 3000
CMD ["node", "dist/main.js"]
