# Stage 1: build the Vite client
FROM node:20-alpine AS builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: run the Express server
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=builder /build/client/dist ./dist

ENV PORT=3035
EXPOSE 3035

CMD ["node", "index.js"]
