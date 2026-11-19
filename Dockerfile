# The hosted app: Node, the built web UI, and Litestream (continuous backups of the SQLite files).
# Fly builds this on its own builders (`fly deploy`), so Docker isn't needed on your machine.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# For better-sqlite3, if its prebuilt binary doesn't fit.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ARG LITESTREAM=0.5.17
# Its fingerprint, from the release's checksums.txt: a changed download fails the build instead of shipping.
ARG LITESTREAM_SHA256=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL -o /tmp/litestream.tar.gz "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM}/litestream-${LITESTREAM}-linux-x86_64.tar.gz" \
  && echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream && rm /tmp/litestream.tar.gz \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
CMD ["/app/deploy/start.sh"]
