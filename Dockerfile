FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
