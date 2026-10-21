# Image for the hatch binary. Run one subcommand per container:
#   docker build -t hatch .
#   docker run --env-file .env hatch api
FROM golang:1.26.10-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hatch ./cmd/hatch

FROM alpine:3.24
# The builder subcommand shells out to git and the Docker CLI.
RUN apk add --no-cache ca-certificates docker-cli git
COPY --from=build /out/hatch /usr/local/bin/hatch
EXPOSE 8080
ENTRYPOINT ["hatch"]
