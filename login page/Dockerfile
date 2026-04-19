FROM node:20-bookworm-slim

WORKDIR /app/backend

# Install backend dependencies first for better layer caching.
COPY backend/package*.json ./
RUN npm ci --omit=dev

WORKDIR /app
COPY . .

EXPOSE 3000

CMD ["npm", "--prefix", "backend", "start"]
