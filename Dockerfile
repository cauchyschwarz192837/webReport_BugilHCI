# base image
FROM node:20-alpine

# set workdir
WORKDIR /app

# dependencies
COPY package*.json ./

# install dependencies
RUN npm install --omit=dev

# copy remaining files
COPY . .

# this container intends to listen on this port
EXPOSE 3001

# default command upon container start
CMD ["node", "server.js"]