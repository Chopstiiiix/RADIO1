FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_ vars must be present at build time for Next.js to inline them
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# Copy static files into standalone output
RUN cp -r public .next/standalone/public 2>/dev/null || true
RUN cp -r .next/static .next/standalone/.next/static

# Create directories for runtime data
RUN mkdir -p stream-output music

ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV BACKEND_PORT=5001
ENV BROADCAST_API_URL=http://localhost:5001

EXPOSE 8080

# Next.js on PORT (8080, Railway-facing), Express on BACKEND_PORT (5001, internal)
CMD ["npx", "concurrently", "node .next/standalone/server.js", "npx tsx server/unified.ts"]
