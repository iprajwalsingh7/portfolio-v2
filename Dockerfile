# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------- frontend ---
# Builds the prerendered site. Its output lands in the backend's
# resources/static, which the next stage packages into the jar — so there is one
# artefact to deploy and no separate CDN or static host to keep in sync.
FROM node:22-alpine AS web

WORKDIR /web

# Copy manifests first so the dependency layer caches independently of source.
COPY frontend/package.json frontend/package-lock.json* ./

# `npm ci` needs a lockfile that matches; fall back to install if it is absent or
# was generated on another platform (native esbuild/rollup binaries differ).
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY frontend/ ./

# vite.config.ts writes to ../backend/src/main/resources/static, i.e. /backend
# here. Both that directory and the content.json copy are created by the build.
RUN npm run build && test -f /backend/src/main/resources/static/index.html


# ----------------------------------------------------------------- backend ---
FROM maven:3.9-eclipse-temurin-21 AS api

WORKDIR /api

# Warm the dependency cache before the sources land, for the same reason.
COPY backend/pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY backend/src ./src

# Bring in what the frontend stage produced.
COPY --from=web /backend/src/main/resources/static ./src/main/resources/static
COPY --from=web /backend/src/main/resources/content.json ./src/main/resources/content.json

RUN mvn -B -DskipTests package && cp target/portfolio-*.jar /api/app.jar


# ----------------------------------------------------------------- runtime ---
FROM eclipse-temurin:21-jre-alpine AS runtime

# Never run as root, and never let the app write to its own code.
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app

# The executable jar, run with a plain `java -jar`.
#
# An earlier version unpacked this into Spring Boot's layer directories and
# invoked org.springframework.boot.loader.launch.JarLauncher directly, to let
# Docker cache dependencies separately from application classes. That is a real
# optimisation, but the layer layout and the launcher's package have both moved
# between Boot versions, and getting either wrong fails at startup with
# ClassNotFoundException rather than at build time. A 60 MB layer per deploy is a
# cheap price for a container that cannot fail this way.
COPY --from=api --chown=app:app /api/app.jar ./app.jar

USER app
EXPOSE 8080

# MaxRAMPercentage is container-aware, unlike a hardcoded -Xmx that is wrong on
# every host but the one it was tuned for. SerialGC suits a small heap on one or
# two cores — G1's background threads cost more than they return at this size.
# ExitOnOutOfMemoryError lets the orchestrator restart a dead container instead of
# leaving it limping.
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"

HEALTHCHECK --interval=30s --timeout=3s --start-period=50s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/actuator/health/readiness | grep -q UP || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
