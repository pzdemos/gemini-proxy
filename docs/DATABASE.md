# PostgreSQL 数据库连接指南

本项目已集成 PostgreSQL 数据库支持，你可以通过环境变量配置数据库连接。

## 快速开始

### 1. 安装 PostgreSQL

如果你还没有安装 PostgreSQL，可以从以下地址下载：

- **Windows**: https://www.postgresql.org/download/windows/
- **macOS**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql` (Ubuntu/Debian)

### 2. 创建数据库

```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE gemini_proxy;

# 创建用户（可选）
CREATE USER gemini_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE gemini_proxy TO gemini_user;
```

### 3. 配置环境变量

创建 `.env` 文件或设置环境变量：

```bash
# 启用数据库功能
ENABLE_DB=true

# 数据库连接配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gemini_proxy
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
DB_MAX_CONNECTIONS=10
```

### 4. 启动服务器

```bash
# 开发模式
deno task dev

# 生产模式
deno task start
```

## 环境变量说明

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `ENABLE_DB` | 是否启用数据库功能 | `false` | 否 |
| `DB_HOST` | 数据库主机地址 | `localhost` | 否 |
| `DB_PORT` | 数据库端口 | `5432` | 否 |
| `DB_NAME` | 数据库名称 | `gemini_proxy` | 否 |
| `DB_USER` | 数据库用户名 | `postgres` | 否 |
| `DB_PASSWORD` | 数据库密码 | `""` | 是 |
| `DB_SSL` | 是否使用 SSL 连接 | `false` | 否 |
| `DB_MAX_CONNECTIONS` | 连接池最大连接数 | `10` | 否 |

## 使用方法

### 在路由中使用数据库

```typescript
import { query, queryOne, execute, transaction } from "../utils/db.ts";

// 查询多条数据
router.get("/api/users", async (ctx) => {
  try {
    const users = await query("SELECT * FROM users");
    ctx.response.body = { success: true, data: users };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "查询失败" };
  }
});

// 查询单条数据
router.get("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;
  const user = await queryOne("SELECT * FROM users WHERE id = $1", [id]);
  if (user) {
    ctx.response.body = { success: true, data: user };
  } else {
    ctx.response.status = 404;
    ctx.response.body = { error: "用户不存在" };
  }
});

// 插入数据
router.post("/api/users", async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const sql = "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *";
  const user = await queryOne(sql, [body.name, body.email]);
  ctx.response.body = { success: true, data: user };
});

// 更新数据
router.put("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;
  const body = await ctx.request.body({ type: "json" }).value;
  const sql = "UPDATE users SET name = $1 WHERE id = $2 RETURNING *";
  const user = await queryOne(sql, [body.name, id]);
  ctx.response.body = { success: true, data: user };
});

// 删除数据
router.delete("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;
  const rowCount = await execute("DELETE FROM users WHERE id = $1", [id]);
  ctx.response.body = { success: true, deleted: rowCount };
});
```

### 使用事务

```typescript
import { transaction } from "../utils/db.ts";

// 执行事务
await transaction(async (client) => {
  await client.queryObject(
    "INSERT INTO users (name, email) VALUES ($1, $2)",
    ["张三", "zhangsan@example.com"]
  );
  
  await client.queryObject(
    "INSERT INTO orders (user_id, amount) VALUES ($1, $2)",
    [1, 100.00]
  );
  
  // 如果任何操作失败，整个事务会回滚
});
```

### 类型安全的查询

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

// 查询时指定类型
const users = await query<User>("SELECT * FROM users");
const user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [1]);
```

## API 参考

### `query<T>(sql: string, params?: unknown[]): Promise<T[]>`

执行查询，返回多行数据。

```typescript
const users = await query<User>("SELECT * FROM users WHERE age > $1", [18]);
```

### `queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>`

执行查询，返回单行数据（如果不存在返回 `null`）。

```typescript
const user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [1]);
```

### `execute(sql: string, params?: unknown[]): Promise<number>`

执行插入/更新/删除操作，返回受影响的行数。

```typescript
const rowCount = await execute("DELETE FROM users WHERE id = $1", [1]);
```

### `transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>`

执行事务操作。

```typescript
await transaction(async (client) => {
  await client.queryObject("INSERT INTO ...");
  await client.queryObject("UPDATE ...");
});
```

### `initDatabase(): Promise<Pool>`

初始化数据库连接池（通常在应用启动时调用）。

### `closeDatabase(): Promise<void>`

关闭数据库连接池（通常在应用关闭时调用）。

## 故障排除

### 连接失败

1. 检查 PostgreSQL 服务是否运行：
   ```bash
   # Windows
   net start postgresql-x64-14
   
   # macOS/Linux
   sudo systemctl status postgresql
   ```

2. 检查防火墙设置，确保端口 5432 开放。

3. 检查数据库用户名和密码是否正确。

4. 检查数据库是否存在：
   ```sql
   \l  -- 列出所有数据库
   ```

### SSL 连接问题

如果使用云数据库（如 AWS RDS、Google Cloud SQL），需要启用 SSL：

```bash
DB_SSL=true
```

### 连接池耗尽

如果遇到 "too many clients" 错误，可以增加最大连接数：

```bash
DB_MAX_CONNECTIONS=20
```

或者检查代码中是否有连接未正确释放。

## 示例项目

查看 `examples/db-usage.ts` 文件了解更多使用示例。

## 安全建议

1. **永远不要**在前端代码中暴露数据库密码。
2. 使用环境变量存储敏感信息。
3. 在生产环境中使用 SSL 连接。
4. 定期备份数据库。
5. 使用强密码。
6. 限制数据库用户的权限。

## 相关资源

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [Deno Postgres 模块](https://deno.land/x/postgres)
- [SQL 教程](https://www.w3schools.com/sql/)

