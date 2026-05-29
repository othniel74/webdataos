# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_API_KEY=dev-local-key-change-me
ARG VITE_CLERK_PUBLISHABLE_KEY=
ARG CLERK_PUBLISHABLE_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_KEY=$VITE_API_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN if [ -z "$VITE_CLERK_PUBLISHABLE_KEY" ] && [ -n "$CLERK_PUBLISHABLE_KEY" ]; then export VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY"; fi; npm run build

# ── Production stage ──
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
