FROM oven/bun:latest

COPY package.json ./
COPY src ./

RUN bun install --frozen-lockfile --production

COPY . .

RUN bun build-main

EXPOSE 3000

CMD ["./server"]
