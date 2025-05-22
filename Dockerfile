FROM oven/bun:latest
WORKDIR /api

# Копирование package.json и package-lock.json
COPY package*.json ./
COPY bun.lockb ./

# Установка зависимостей
RUN bun install

# Копирование всего проекта
COPY . .

# Генерация Prisma клиента
RUN bunx prisma generate

# Сборка приложения
RUN bun run build

# Открытие порта
EXPOSE 3000

# Запуск приложения
CMD ["bun", "run", "dist/src/main.js"]