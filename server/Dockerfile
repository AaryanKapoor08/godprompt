FROM node:20-slim AS base
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src
COPY tsconfig.json ./

EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
