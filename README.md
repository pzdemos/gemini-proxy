# Gemini AI Chat 代理服务器

一个基于 Deno 的 Google Gemini AI API
代理服务器,配备了现代化的聊天界面和用户管理系统。

## 功能特性

### 后端功能

- 🚀 基于 Deno 和 Oak 框架构建
- 🔑 安全的 API 密钥管理
- 📡 支持同步和流式响应
- 🎯 多模型支持（Gemini 2.0 Flash, 1.5 Pro 等）
- 🌐 CORS 支持
- 📊 Token 使用统计
- 👥 完整的用户管理系统
- 🗄️ PostgreSQL 数据库支持

### 前端功能

- 💬 现代化聊天界面（类 OpenRouter 风格）
- 🌊 流式对话支持（Server-Sent Events）
- 🎨 Markdown 渲染和代码高亮
- 🌙 深色/浅色主题切换
- 🎛️ 参数调节（Temperature, Max Tokens）
- 📱 响应式设计
- ⚡ 实时模型切换

## 快速开始

### 环境要求

- Deno 1.38+
- Google AI API Key
- PostgreSQL 数据库（可选）

### 安装和运行

1. 克隆项目

```bash
git clone <repository-url>
cd gemini-proxy
```

2. 设置环境变量

```bash
# 创建 .env 文件
echo "GOOGLE_AI_API_KEY=your-api-key-here" > .env
echo "ENABLE_DB=true" >> .env
echo "DATABASE_URL=postgresql://user:password@localhost:5432/dbname" >> .env
```

3. 启动服务器

开发模式（支持热重载）:

```bash
deno task dev
```

生产模式:

```bash
deno task start
```

4. 访问应用

```
http://localhost:8000
```

## API 端点

### 核心 API

| 端点                   | 方法 | 描述             |
| ---------------------- | ---- | ---------------- |
| `/`                    | GET  | 前端聊天界面     |
| `/api/health`          | GET  | 健康检查         |
| `/api/models`          | GET  | 获取可用模型列表 |
| `/api/generate`        | POST | 同步文本生成     |
| `/api/generate-stream` | POST | 流式文本生成     |

### 用户管理 API

| 端点                          | 方法   | 描述                      |
| ----------------------------- | ------ | ------------------------- |
| `/api/users`                  | GET    | 获取用户列表（分页）      |
| `/api/users/:userId`          | GET    | 获取单个用户详情          |
| `/api/users`                  | POST   | 创建新用户                |
| `/api/users/:userId`          | PUT    | 更新用户信息              |
| `/api/users/:userId/password` | PATCH  | 修改用户密码              |
| `/api/users/:userId`          | DELETE | 删除用户（软删除/硬删除） |
| `/api/users/batch/status`     | PATCH  | 批量激活/停用用户         |
| `/api/users/stats/summary`    | GET    | 获取用户统计信息          |

### 数据库管理 API

| 端点                              | 方法 | 描述               |
| --------------------------------- | ---- | ------------------ |
| `/db/admin`                       | GET  | 数据库管理界面     |
| `/db/health`                      | GET  | 数据库健康检查     |
| `/db/info`                        | GET  | 获取数据库信息     |
| `/db/tables`                      | GET  | 获取所有表列表     |
| `/db/tables/:tableName/structure` | GET  | 获取表结构         |
| `/db/tables/:tableName/data`      | GET  | 获取表数据（分页） |
| `/db/query`                       | POST | 执行自定义查询     |
| `/db/tables/create`               | POST | 创建新表           |
| `/db/stats`                       | GET  | 获取数据库统计信息 |

## 用户管理 API 详细文档

### 1. 获取用户列表（分页）

**请求:**

```bash
# 基本请求
curl "http://localhost:8000/api/users?page=1&limit=10"

# 带搜索
curl "http://localhost:8000/api/users?page=1&limit=10&search=admin"
```

**请求参数:**

- `page` (可选): 页码,默认 1
- `limit` (可选): 每页数量,默认 10
- `search` (可选): 搜索关键词（搜索用户名、邮箱、全名）

**响应示例:**

```json
{
  "success": true,
  "data": [
    {
      "user_id": "1",
      "username": "admin",
      "email": "admin@example.com",
      "full_name": "System Admin",
      "is_active": true,
      "role_id": 1,
      "created_at": "2025-11-25T17:21:59.300Z",
      "updated_at": "2025-11-25T17:21:59.300Z",
      "profile_image_url": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### 2. 获取单个用户详情

**请求:**

```bash
curl http://localhost:8000/api/users/1
```

**响应示例:**

```json
{
  "success": true,
  "data": {
    "user_id": "1",
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "System Admin",
    "is_active": true,
    "role_id": 1,
    "created_at": "2025-11-25T17:21:59.300Z",
    "updated_at": "2025-11-25T17:21:59.300Z",
    "profile_image_url": null
  }
}
```

### 3. 创建新用户

**请求:**

```bash
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "password123",
    "full_name": "New User",
    "is_active": true,
    "role_id": 2,
    "profile_image_url": null
  }'
```

**请求参数:**

- `username` (必填): 用户名
- `email` (必填): 邮箱地址
- `password` (必填): 密码
- `full_name` (必填): 全名
- `is_active` (可选): 是否激活,默认 true
- `role_id` (可选): 角色 ID,默认 2
- `profile_image_url` (可选): 头像 URL

**响应示例:**

```json
{
  "success": true,
  "message": "用户创建成功",
  "data": {
    "user_id": "2",
    "username": "newuser",
    "email": "newuser@example.com",
    "full_name": "New User",
    "is_active": true,
    "role_id": 2,
    "created_at": "2025-11-26T01:30:00.000Z",
    "updated_at": "2025-11-26T01:30:00.000Z",
    "profile_image_url": null
  }
}
```

### 4. 更新用户信息

**请求:**

```bash
curl -X PUT http://localhost:8000/api/users/2 \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Updated Name",
    "email": "updated@example.com",
    "is_active": true
  }'
```

**请求参数（所有参数可选,只更新提供的字段）:**

- `username`: 用户名
- `email`: 邮箱地址
- `full_name`: 全名
- `is_active`: 是否激活
- `role_id`: 角色 ID
- `profile_image_url`: 头像 URL

**响应示例:**

```json
{
  "success": true,
  "message": "用户更新成功",
  "data": {
    "user_id": "2",
    "username": "newuser",
    "email": "updated@example.com",
    "full_name": "Updated Name",
    "is_active": true,
    "role_id": 2,
    "created_at": "2025-11-26T01:30:00.000Z",
    "updated_at": "2025-11-26T01:35:00.000Z",
    "profile_image_url": null
  }
}
```

### 5. 修改用户密码

**请求:**

```bash
curl -X PATCH http://localhost:8000/api/users/2/password \
  -H "Content-Type: application/json" \
  -d '{
    "password": "newPassword123"
  }'
```

**请求参数:**

- `password` (必填): 新密码,最少 6 位

**响应示例:**

```json
{
  "success": true,
  "message": "密码更新成功"
}
```

### 6. 删除用户

**请求:**

```bash
# 软删除（设置为不活跃）
curl -X DELETE http://localhost:8000/api/users/2

# 硬删除（永久删除）
curl -X DELETE "http://localhost:8000/api/users/2?hard=true"
```

**请求参数:**

- `hard` (可选): 查询参数,设置为 "true" 进行硬删除

**响应示例（软删除）:**

```json
{
  "success": true,
  "message": "用户已停用"
}
```

**响应示例（硬删除）:**

```json
{
  "success": true,
  "message": "用户已永久删除"
}
```

### 7. 批量激活/停用用户

**请求:**

```bash
curl -X PATCH http://localhost:8000/api/users/batch/status \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["2", "3", "4"],
    "is_active": false
  }'
```

**请求参数:**

- `userIds` (必填): 用户 ID 数组
- `is_active` (必填): 布尔值,true 为激活,false 为停用

**响应示例:**

```json
{
  "success": true,
  "message": "已停用 3 个用户"
}
```

### 8. 获取用户统计信息

**请求:**

```bash
curl http://localhost:8000/api/users/stats/summary
```

**响应示例:**

```json
{
  "success": true,
  "data": {
    "total": 10,
    "active": 8,
    "inactive": 2,
    "todayNew": 1,
    "weekNew": 5
  }
}
```

## 错误响应格式

所有接口在出错时返回统一格式:

```json
{
  "success": false,
  "message": "错误描述信息",
  "error": "详细错误信息（可选）"
}
```

**常见 HTTP 状态码:**

- `200`: 成功
- `201`: 创建成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `409`: 资源冲突（如用户名已存在）
- `500`: 服务器内部错误

## 配置选项

### 环境变量

- `GOOGLE_AI_API_KEY`: Google AI API 密钥（必需）
- `PORT`: 服务器端口（默认: 8000）
- `ENABLE_DB`: 是否启用数据库功能（true/false）
- `DATABASE_URL`: PostgreSQL 数据库连接字符串

### 前端参数

- **Temperature**: 0-2（控制创造性,默认: 0.7）
- **Max Tokens**: 100-4096（最大输出长度,默认: 1024）
- **Stream Mode**: 开启/关闭流式输出

## 项目结构

```
gemini-proxy/
├── main.ts                      # 服务器主文件
├── routes/
│   ├── api.ts                   # AI API 路由
│   ├── pdb-manage/              # 数据库管理
│   │   ├── db.ts                # 数据库路由
│   │   └── public/
│   │       └── index.html       # 数据库管理界面
│   └── user-manage/             # 用户管理
│       └── users.ts             # 用户管理路由
├── utils/
│   └── db.ts                    # 数据库工具
├── index.html                   # 前端聊天界面
├── deno.json                    # Deno 配置
├── deno.lock                    # 依赖锁文件
├── .env                         # 环境变量（需创建）
├── .gitignore                   # Git 忽略配置
└── README.md                    # 项目说明
```

## 技术栈

### 后端

- **Deno**: 安全的 JavaScript/TypeScript 运行时
- **Oak**: Web 框架
- **Google Generative AI**: Gemini 模型 API
- **PostgreSQL**: 关系型数据库
- **bcrypt**: 密码加密

### 前端

- **Vue 3**: 响应式框架
- **React**: 数据库管理界面
- **Tailwind CSS**: 实用优先的 CSS 框架
- **Marked.js**: Markdown 解析
- **Highlight.js**: 代码高亮
- **Axios**: HTTP 客户端

## 部署

### Deno Deploy

项目已配置支持 Deno Deploy:

```bash
deno deploy
```

### Docker（可选）

```dockerfile
FROM denoland/deno:1.38.0

WORKDIR /app
COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", "main.ts"]
```

## 安全注意事项

1. **API 密钥保护**: 永远不要在前端暴露 API 密钥
2. **HTTPS**: 生产环境建议使用 HTTPS
3. **访问控制**: 考虑添加认证机制
4. **速率限制**: 防止 API 滥用
5. **密码安全**: 使用 bcrypt 加密存储密码
6. **SQL 注入防护**: 使用参数化查询
7. **输入验证**: 验证所有用户输入

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request!

## 支持

如有问题,请提交 Issue 或联系维护者。
