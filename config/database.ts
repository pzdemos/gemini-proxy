// config/database.ts - 数据库配置
export interface DatabaseConfig {
  hostname: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // 连接池最大连接数
}

/**
 * 从环境变量获取数据库配置
 */
export function getDatabaseConfig(): DatabaseConfig {
  const hostname = Deno.env.get("DB_HOST");
  const port = Number(Deno.env.get("DB_PORT"));
  const database = Deno.env.get("DB_NAME");
  const user = Deno.env.get("DB_USER");
  const password = Deno.env.get("DB_PASSWORD");
  const ssl = Deno.env.get("DB_SSL") === "true";
  const max = Number(Deno.env.get("DB_MAX_CONNECTIONS"));

  if (!password) {
    console.warn("⚠️ 警告: DB_PASSWORD 未设置，使用空密码");
  }

  return {
    hostname: hostname || "",
    port: port || 5432,
    database: database || "",
    user: user || "",
    password: password || "",
    ssl: ssl || false,
    max: max || 10,
  };
}

/**
 * 生成 PostgreSQL 连接字符串
 */
export function getConnectionString(config?: DatabaseConfig): string {
  const dbConfig = config || getDatabaseConfig();
  
  const params = new URLSearchParams({
    host: dbConfig.hostname,
    port: dbConfig.port.toString(),
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  if (dbConfig.ssl) {
    params.append("sslmode", "require");
  }

  return `postgres://${dbConfig.user}:${dbConfig.password}@${dbConfig.hostname}:${dbConfig.port}/${dbConfig.database}`;
}

