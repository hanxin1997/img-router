FROM denoland/deno:latest
WORKDIR /app

# 复制所有必要文件
COPY main.ts .
COPY config.ts .
COPY deno.json .
COPY logger.ts .
COPY ui-server.ts .
COPY start.ts .

# 复制 UI 静态文件
COPY ui/ ./ui/

# 创建数据目录
RUN mkdir -p /app/data

# 缓存依赖
RUN deno cache main.ts ui-server.ts start.ts

# 暴露端口：API (10001) + UI (5854)
EXPOSE 10001 5854

# 启动命令
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "start.ts"]
