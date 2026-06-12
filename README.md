# 博物馆通票预约与参观管理平台（纯后端）

文博通票预约与场馆参观管理的纯后端 API 服务，作为 Feature 迭代题的基座工程。

## 技术栈

- Node.js + Express + TypeScript
- Prisma ORM + MySQL 8（字符集 utf8mb4）
- JWT 鉴权（jsonwebtoken）、bcryptjs 密码哈希、zod 参数校验

## 启动（Docker）

```bash
docker compose up --build
```

启动后：

- MySQL 容器自动就绪后，应用容器会自动同步表结构（`prisma db push`）并灌入种子数据；
- 服务监听 `http://127.0.0.1:7651`。

## 内置账号

唯一管理员（本平台只有 admin 一个角色）：

- 用户名：`admin`
- 密码：`admin123`

## 已实现的基础功能

- 登录签发 JWT、获取当前用户（`/api/auth/login`、`/api/auth/me`）
- 场馆增删改查（`/api/museums`）
- 预约查询、登记（带每日容量校验）、状态流转（`/api/reservations`）
- 仪表盘统计（`/api/dashboard/stats`）
- 健康检查（`/api/health`）

除 `login` 与 `health` 外，接口均需 `Authorization: Bearer <token>`。

## 编码说明

数据库使用 utf8mb4，连接串显式指定 charset；Express JSON 响应为 UTF-8，中文不乱码。
