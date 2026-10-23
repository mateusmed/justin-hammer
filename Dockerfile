FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Banco de métricas no volume; o node:sqlite ainda avisa que é experimental
ENV PORT=3001 DATA_PATH=/data NODE_NO_WARNINGS=1
EXPOSE 3001

CMD ["node", "src/server.js"]
