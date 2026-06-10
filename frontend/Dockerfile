# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
RUN npm run build

# --- Serve stage ---
FROM node:20-alpine AS serve
WORKDIR /app

# vite preview serves the built /dist as a static SPA.
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/node_modules ./node_modules

EXPOSE 5173
CMD ["npm", "run", "preview"]
