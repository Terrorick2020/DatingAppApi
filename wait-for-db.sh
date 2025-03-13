#!/bin/bash

echo "Waiting for database connection..."
until nc -z db 5432; do
  sleep 1
done

echo "Database is up, running Prisma migrations..."
npx prisma db push
echo "Prisma migrations applied success"


npm run build
npm run start:prod
