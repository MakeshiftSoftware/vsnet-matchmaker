FROM node:8

ENV NPM_CONFIG_LOGLEVEL warn

RUN npm install pm2 -g

# Bundle app
COPY src src/
COPY package.json .
COPY ecosystem.config.js .

# Install app dependencies
RUN npm install --production

CMD [ "npm", "run", "dev"]