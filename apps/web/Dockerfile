FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/web ./apps/web
RUN npm install --workspace=@blink/web && npm run build -w @blink/web

FROM nginx:1.27-alpine
COPY deploy/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
