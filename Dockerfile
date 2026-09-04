FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY sql ./sql
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "src/index.js"]
