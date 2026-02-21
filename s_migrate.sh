#!/usr/bin/env bash

echo "Installing dependencies..."
npm install

echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Building Next.js app..."
npm run build

echo "Deploy script complete."