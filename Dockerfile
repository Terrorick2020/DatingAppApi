FROM node:20-alpine

RUN apk add --no-cache bash netcat-openbsd

WORKDIR /api

COPY package.json .
RUN npm install --omit=dev --legacy-peer-deps

COPY . .

RUN sed -i 's/\r$//' /api/wait-for-db.sh \
    && chmod +x /api/wait-for-db.sh

RUN npx prisma generate

EXPOSE 3000

CMD ["bash", "/api/wait-for-db.sh"]
