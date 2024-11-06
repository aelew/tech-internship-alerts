FROM oven/bun:1 AS base
WORKDIR /app

# install dependencies into temp directory with --production (exclude devDependencies)
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY ./src ./src
COPY ./package.json .

# install git
RUN apt-get update && apt-get install -y git

# define a persistent volume for data storage
VOLUME /app/data

# make data directory
RUN mkdir -p /app/data && chown bun:bun /app/data

# run app
USER bun
ENTRYPOINT [ "bun", "." ]
