FROM node:20-bookworm-slim

# Install Python 3 + pip
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Make python3 the default python
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy everything
COPY . .

# Install Python dependencies (flask, requests, websocket-client, etc.)
RUN pip3 install --break-system-packages -r artifacts/api-server/requirements.txt

# Install Node dependencies
RUN pnpm install --frozen-lockfile

# Build frontend (BASE_PATH=/ since the API server serves it from root)
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/iq-trader run build

# Build API server
RUN pnpm --filter @workspace/api-server run build

EXPOSE 10000

ENV NODE_ENV=production
ENV PORT=10000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
