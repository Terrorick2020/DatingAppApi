FROM node:20-alpine AS deps
WORKDIR /api

RUN npm install -g @nestjs/cli@latest

COPY package*.json ./
RUN npm install --legacy-peer-deps --prefer-offline


FROM node:20-alpine AS builder
WORKDIR /api
COPY --from=deps /api/node_modules ./node_modules
COPY . .

RUN npm install -g @nestjs/cli
RUN npx prisma generate
RUN npm run build


FROM node:20-alpine
WORKDIR /api
COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api/dist ./dist
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
