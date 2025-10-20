# Сборка
FROM node:22-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467 AS builder
 
WORKDIR /api

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build

# Продуктивный образ
FROM node:22-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467

# Устанавливаем ffmpeg для создания превью видео
RUN apk add --no-cache ffmpeg

WORKDIR /api

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api/dist ./dist
COPY --from=builder /api/prisma ./prisma
COPY --from=builder /api/tsconfig.json ./tsconfig.json
COPY --from=builder /api/package.json ./package.json
COPY --from=builder /api/wait-for-db.sh ./wait-for-db.sh

RUN chmod +x ./wait-for-db.sh

EXPOSE 3000

CMD ["sh", "./wait-for-db.sh"]