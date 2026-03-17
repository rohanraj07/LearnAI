FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-optional

COPY src/ ./src/

EXPOSE 8000

CMD ["node", "src/index.js"]
