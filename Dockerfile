
FROM node:18-bullseye

RUN apt-get update && apt-get install -y python3-pip ffmpeg --no-install-recommends \
  && pip3 install --no-cache-dir yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package.json package.json
RUN npm install --production

COPY server.js server.js

EXPOSE 3000
CMD ["node", "server.js"]
