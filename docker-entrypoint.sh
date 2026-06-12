#!/bin/sh
set -e

echo "[entrypoint] 等待数据库并同步表结构（带重试）..."
i=1
until npx prisma db push --skip-generate; do
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] 数据库在超时时间内未就绪，放弃"
    exit 1
  fi
  echo "[entrypoint] 数据库未就绪，2 秒后重试... ($i)"
  i=$((i + 1))
  sleep 2
done

echo "[entrypoint] 初始化种子数据..."
node dist/seed.js

echo "[entrypoint] 启动服务..."
exec node dist/server.js
