FROM node:20-alpine

RUN apk add --no-cache bash netcat-openbsd

WORKDIR /api

COPY package*.json ./
RUN npm install --production --legacy-peer-deps

COPY . .

RUN sed -i 's/\r$//' /server/wait-for-db.sh \
    && chmod +x /server/wait-for-db.sh

RUN npx prisma generate

EXPOSE 3000

CMD ["bash", "/server/wait-for-db.sh"]
