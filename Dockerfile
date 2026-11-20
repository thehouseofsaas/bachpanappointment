# Self-hosting on a small server (the app also runs on Vercel without this file).
#   docker build -t ptm-booking .
#   docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... -e SETUP_TOKEN=... ptm-booking
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Database migrations (run once per release: see README).
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "server.js"]
