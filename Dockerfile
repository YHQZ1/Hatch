# Image for the hatch binary, with the web UI embedded. Run one subcommand per
# container:
#   docker build --build-arg VERSION=$(git describe --tags --always) -t hatch .
#   docker run --env-file .env hatch api

# Build the web UI into web/dist.
FROM node:24-alpine AS web
WORKDIR /src/web
# corepack installs the pnpm version pinned in web/package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# Build the binary, embedding web/dist.
FROM golang:1.27.3-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ cmd/
COPY internal/ internal/
COPY web/embed.go web/embed.go
COPY --from=web /src/web/dist web/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/hatch ./cmd/hatch

FROM alpine:3.24
# The builder subcommand shells out to git and the Docker CLI.
RUN apk add --no-cache ca-certificates docker-cli git \
	&& adduser -D -H -u 10001 hatch
COPY --from=build /out/hatch /usr/local/bin/hatch
# Runs as a non-root user. `hatch builder` needs the host's Docker socket:
# mount it and add the socket's group, for example
#   docker run -v /var/run/docker.sock:/var/run/docker.sock \
#     --group-add "$(stat -c %g /var/run/docker.sock)" hatch builder
USER 10001
EXPOSE 8080
ENTRYPOINT ["hatch"]
