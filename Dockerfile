FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3847
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/signal.db

RUN npm run build

EXPOSE 3847

CMD ["npm", "run", "start"]
