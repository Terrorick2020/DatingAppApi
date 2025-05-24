FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /api

COPY package.json .

RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate

EXPOSE 3000

COPY wait-for-db.sh /server/wait-for-db.sh

RUN sed -i 's/\r//' /server/wait-for-db.sh
RUN chmod +x /server/wait-for-db.sh

CMD ["/bin/bash", "/server/wait-for-db.sh"]
