FROM node:20-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/core/package.json ./packages/core/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/sdk/package.json ./packages/sdk/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build all packages
RUN pnpm build

EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
