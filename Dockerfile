FROM oven/bun:latest

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json ./
COPY src ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun build-main

EXPOSE 3000

CMD ["./server"]
