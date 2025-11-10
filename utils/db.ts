// utils/db.ts - 数据库连接工具
import { Pool, PoolClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { getDatabaseConfig } from "../config/database.ts";

// 全局数据库连接池
let pool: Pool | null = null;

/**
 * 初始化数据库连接池
 */
export async function initDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  try {
    const config = getDatabaseConfig();
    
    console.log(`🔌 正在连接数据库: ${config.hostname}:${config.port}/${config.database}`);
    
    // 构建连接选项（postgres 库不支持直接传递 ssl，需要在连接字符串中处理）
    const poolOptions: {
      database: string;
      hostname: string;
      port: number;
      user: string;
      password: string;
      tls?: { enabled: boolean; enforce?: boolean; caCertificates?: string[] };
    } = {
      database: config.database,
      hostname: config.hostname,
      port: config.port,
      user: config.user,
      password: config.password,
    };

    // 如果启用 SSL，添加 TLS 配置（禁用严格验证以避免 close_notify 问题）
    if (config.ssl) {
      poolOptions.tls = { 
        enabled: true,
        enforce: false,
        caCertificates: []
      };
    }
    
    pool = new Pool(poolOptions, config.max || 10, true);

    // 测试连接
    const client = await pool.connect();
    const result = await client.queryObject<{ now: Date }>("SELECT NOW() as now");
    client.release();
    if (result.rows[0]) {
      console.log(`📊 数据库时间: ${result.rows[0].now}`);
    }
    
    return pool;
  } catch (error) {
    console.error("❌ 数据库连接失败:", error);
    throw error;
  }
}

/**
 * 获取数据库连接池
 * 如果未初始化，会自动初始化
 */
export async function getPool(): Promise<Pool> {
  if (!pool) {
    return await initDatabase();
  }
  return pool;
}

/**
 * 执行查询（返回多行）
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const dbPool = await getPool();
  const client = await dbPool.connect();
  
  try {
    const result = await client.queryObject<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 执行查询（返回单行）
 */
export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results[0] || null;
}

/**
 * 执行插入/更新/删除操作
 */
export async function execute(
  sql: string,
  params?: unknown[]
): Promise<number> {
  const dbPool = await getPool();
  const client = await dbPool.connect();
  
  try {
    const result = await client.queryObject(sql, params);
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}

/**
 * 执行事务
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const dbPool = await getPool();
  const client = await dbPool.connect();
  
  try {
    await client.queryObject("BEGIN");
    const result = await callback(client);
    await client.queryObject("COMMIT");
    return result;
  } catch (error) {
    await client.queryObject("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 关闭数据库连接池
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("🔌 数据库连接已关闭");
  }
}

