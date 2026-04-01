FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Copy static files into standalone output
RUN cp -r public .next/standalone/public 2>/dev/null || true
RUN cp -r .next/static .next/standalone/.next/static

# Create directories for runtime data
RUN mkdir -p stream-output music

ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV BACKEND_PORT=5001

EXPOSE 8080

# Run both Next.js standalone server and Express backend
CMD ["npx", "concurrently", "node .next/standalone/server.js", "npx tsx server/unified.ts"]
