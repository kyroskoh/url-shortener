FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install --workspace=@blink/shared --workspace=@blink/web \
  && npm run build -w @blink/shared \
  && npm run build -w @blink/web

FROM nginx:1.27-alpine
COPY deploy/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
