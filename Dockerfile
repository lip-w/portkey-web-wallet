FROM node:20.11.0 AS base
ARG web=/app
ARG external_port=3000

FROM base AS deps
WORKDIR ${web}
COPY package.json yarn.lock* package-lock.json* ./
RUN yarn install --frozen-lockfile
RUN pwd
RUN ls ${web}


FROM base AS builder
WORKDIR ${web}
COPY --from=deps ${web}/node_modules ./node_modules
COPY . .
RUN yarn build
RUN pwd
RUN ls ${web}


FROM base AS runner
WORKDIR ${web}
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 vite
# RUN mkdir dist
# RUN chown vite:nodejs dist
COPY --from=builder ${web}/dist ./dist
COPY --from=builder ${web}/node_modules ./node_modules


# USER vite
EXPOSE ${external_port}
ENV PORT=${external_port}
CMD ["npx", "http-server", "dist", "--port", "3000"]
