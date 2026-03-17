FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-optional

COPY src/ ./src/

EXPOSE 8006

CMD ["node", "src/index.js"]
