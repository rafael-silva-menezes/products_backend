FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --frozen-lockfile

COPY . .

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/src/config ./src/config 

RUN npm install --production --frozen-lockfile

RUN mkdir -p ./uploads/chunks

RUN npm install -g typeorm

CMD ["sh", "-c", "typeorm migration:run -d ./dist/config/data-source.js && node dist/main.js"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8000/ || exit 1