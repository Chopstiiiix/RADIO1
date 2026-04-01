FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install

# Only copy server code and config needed for backend
COPY server/ ./server/
COPY tsconfig.json ./

# Create directories for runtime data
RUN mkdir -p stream-output music

ENV HOSTNAME=0.0.0.0

EXPOSE 5001

CMD ["npx", "tsx", "server/unified.ts"]
