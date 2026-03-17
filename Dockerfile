FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Standalone mode requires static assets copied alongside server.js
RUN cp -r .next/static .next/standalone/.next/static
RUN cp -r public .next/standalone/public 2>/dev/null || true

ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
