ARG BASE_HREF=/
ARG API_URL=/agora
ARG WS_URL=
ARG API_KEY=token2025

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --configuration=production --base-href=$BASE_HREF

FROM nginx:alpine
RUN apk add --no-cache envsubst
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]