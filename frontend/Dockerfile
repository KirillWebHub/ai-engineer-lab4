FROM node:24-alpine AS build
WORKDIR /app

# В контейнере frontend ходит в реальный backend через Nginx.
ARG VITE_API_MODE=http
ENV VITE_API_MODE=$VITE_API_MODE

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
