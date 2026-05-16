FROM oven/bun:1.3.14

RUN apt-get update \
  && apt-get install -y --no-install-recommends p7zip-full \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src ./src
CMD ["bun", "run", "start"]
