FROM node:26-alpine
WORKDIR /app
COPY package.json server.js badges.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080 SYNC_PORT=8081 DATA_DIR=/data
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 8080 8081
USER node
CMD ["node", "server.js"]
