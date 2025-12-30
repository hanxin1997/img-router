FROM denoland/deno:latest
WORKDIR /app

COPY main.ts .
COPY config.ts .
COPY deno.json .
COPY logger.ts .

RUN deno cache main.ts
EXPOSE 10001
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]