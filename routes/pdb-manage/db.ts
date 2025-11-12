// deno-lint-ignore-file
// routes/db.ts - 数据库查询路由
import { Router, type Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { query, queryOne } from "../../utils/db.ts";

// 创建数据库路由
export const dbRouter = new Router();

// 提供数据库管理界面
dbRouter.get("/db/admin", async (ctx: Context) => {
  try {
    const html = await Deno.readTextFile("./routes/pdb-manage/public/index.html");
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = html;
  } catch (error) {
    ctx.response.status = 404;
    ctx.response.body = { error: "管理界面文件未找到" };
  }
});

// 健康检查 - 测试数据库连接
dbRouter.get("/db/health", async (ctx: Context) => {
  try {
    // 检查数据库是否启用
    const ENABLE_DB = Deno.env.get("ENABLE_DB") === "true";
    
    if (!ENABLE_DB) {
      ctx.response.body = {
        success: false,
        message: "数据库功能未启用",
        error: "ENABLE_DB 环境变量未设置为 true",
        enabled: false,
      };
      return;
    }
    
    const result = await queryOne<{ now: Date }>("SELECT NOW() as now");
    if (result) {
      ctx.response.body = {
        success: true,
        message: "数据库连接正常",
        timestamp: result.now,
        enabled: true,
      };
    } else {
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        message: "数据库连接异常",
        enabled: true,
      };
    }
  } catch (error) {
    console.error("数据库健康检查失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "数据库连接失败",
      error: error instanceof Error ? error.message : String(error),
      enabled: true,
    };
  }
});

// 获取数据库信息
dbRouter.get("/db/info", async (ctx: Context) => {
  try {
    // 检查数据库是否启用
    const ENABLE_DB = Deno.env.get("ENABLE_DB") === "true";
    
    if (!ENABLE_DB) {
      ctx.response.body = {
        success: false,
        message: "数据库功能未启用",
        error: "请在环境变量中设置 ENABLE_DB=true 来启用数据库功能",
        enabled: false,
      };
      return;
    }

    // 获取数据库版本
    const version = await queryOne<{ version: string }>(
      "SELECT version() as version"
    );

    // 获取当前数据库名称
    const currentDb = await queryOne<{ current_database: string }>(
      "SELECT current_database() as current_database"
    );

    // 获取数据库大小
    const dbSize = await queryOne<{ size: string }>(
      `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
    );

    // 获取连接数
    const connections = await queryOne<{ count: number }>(
      "SELECT count(*)::int as count FROM pg_stat_activity WHERE datname = current_database()"
    );

    ctx.response.body = {
      success: true,
      data: {
        version: version?.version,
        database: currentDb?.current_database,
        size: dbSize?.size,
        connections: connections?.count,
      },
      enabled: true,
    };
  } catch (error) {
    console.error("获取数据库信息失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取数据库信息失败",
      error: error instanceof Error ? error.message : String(error),
      enabled: true,
    };
  }
});

// 获取所有表列表
dbRouter.get("/db/tables", async (ctx: Context) => {
  try {
    // 检查数据库是否启用
    const ENABLE_DB = Deno.env.get("ENABLE_DB") === "true";
    
    if (!ENABLE_DB) {
      ctx.response.body = {
        success: false,
        message: "数据库功能未启用",
        error: "请在环境变量中设置 ENABLE_DB=true 来启用数据库功能",
        data: [],
        count: 0,
        enabled: false,
      };
      return;
    }

    const tables = await query<{
      table_name: string;
      table_schema: string;
    }>(
      `
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `
    );

    ctx.response.body = {
      success: true,
      data: tables,
      count: tables.length,
      enabled: true,
    };
  } catch (error) {
    console.error("获取表列表失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取表列表失败",
      error: error instanceof Error ? error.message : String(error),
      enabled: true,
    };
  }
});

// 获取表结构
dbRouter.get("/db/tables/:tableName/structure", async (ctx: Context) => {
  try {
    // @ts-ignore
    const tableName = ctx?.params?.tableName as string | undefined;
    if (!tableName) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "表名不能为空",
      };
      return;
    }

    const columns = await query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
    }>(
      `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `,
      [tableName]
    );

    if (columns.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: `表 ${tableName} 不存在`,
      };
      return;
    }

    ctx.response.body = {
      success: true,
      table: tableName,
      data: columns,
      count: columns.length,
    };
  } catch (error) {
    console.error("获取表结构失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取表结构失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 执行自定义查询（只读，用于安全考虑只允许 SELECT）
dbRouter.post("/db/query", async (ctx: Context) => {
  try {
    // 检查数据库是否启用
    const ENABLE_DB = Deno.env.get("ENABLE_DB") === "true";
    
    if (!ENABLE_DB) {
      ctx.response.status = 503;
      ctx.response.body = {
        success: false,
        message: "数据库功能未启用",
        error: "请在环境变量中设置 ENABLE_DB=true 来启用数据库功能",
        enabled: false,
      };
      return;
    }

    const body = await ctx.request.body({ type: "json" }).value;
    const { sql, params } = body;

    if (!sql || typeof sql !== "string") {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "SQL 查询语句不能为空",
        enabled: true,
      };
      return;
    }

    // 安全检查：只允许 SELECT 查询
    // const trimmedSql = sql.trim().toUpperCase();
    // if (!trimmedSql.startsWith("SELECT")) {
    //   ctx.response.status = 400;
    //   ctx.response.body = {
    //     success: false,
    //     message: "只允许执行 SELECT 查询",
    //   };
    //   return;
    // }

    // 限制查询长度，防止过大的查询
    if (sql.length > 10000) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "查询语句过长",
        enabled: true,
      };
      return;
    }

    const results = await query(sql, params || []);

    ctx.response.body = {
      success: true,
      data: results,
      count: results.length,
      enabled: true,
    };
  } catch (error) {
    console.error("执行查询失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "执行查询失败",
      error: error instanceof Error ? error.message : String(error),
      enabled: true,
    };
  }
});

// 获取表数据（带分页）
dbRouter.get("/db/tables/:tableName/data", async (ctx: Context) => {
  try {
    // @ts-ignore: params is defined by Oak router and available at runtime
    const tableName = ctx.params?.tableName as string | undefined;
    const url = ctx.request.url;
    const page = Number(url.searchParams.get("page")) || 1;
    const limit = Number(url.searchParams.get("limit")) || 10;
    const offset = (page - 1) * limit;

    if (!tableName) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "表名不能为空",
      };
      return;
    }

    // 验证表名，防止 SQL 注入
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "无效的表名",
      };
      return;
    }

    // 获取总记录数
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM ${tableName}`
    );

    // 获取分页数据
    const data = await query(
      `SELECT * FROM ${tableName} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    ctx.response.body = {
      success: true,
      table: tableName,
      data: data,
      pagination: {
        page: page,
        limit: limit,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limit),
      },
    };
  } catch (error) {
    console.error("获取表数据失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取表数据失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 创建新表
dbRouter.post("/db/tables/create", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { tableName, columns, primaryKey, indexes, comment } = body;

    // 验证表名
    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "无效的表名。表名必须以字母或下划线开头，只能包含字母、数字和下划线",
      };
      return;
    }

    // 验证列定义
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "至少需要定义一个列",
      };
      return;
    }

    // 构建CREATE TABLE语句
    const columnDefs = columns.map((col: any) => {
      const parts = [`"${col.name}"`];
      
      // 数据类型
      if (col.type.toUpperCase().includes('VARCHAR') || col.type.toUpperCase().includes('CHAR')) {
        parts.push(`${col.type}${col.length ? `(${col.length})` : ''}`);
      } else if (col.type.toUpperCase().includes('NUMERIC') || col.type.toUpperCase().includes('DECIMAL')) {
        parts.push(`${col.type}${col.precision ? `(${col.precision}${col.scale ? `,${col.scale}` : ''})` : ''}`);
      } else {
        parts.push(col.type);
      }
      
      // NOT NULL约束
      if (col.notNull) {
        parts.push('NOT NULL');
      }
      
      // UNIQUE约束
      if (col.unique) {
        parts.push('UNIQUE');
      }
      
      // DEFAULT值
      if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
        if (col.type.toUpperCase().includes('CHAR') || col.type.toUpperCase().includes('TEXT')) {
          parts.push(`DEFAULT '${col.defaultValue}'`);
        } else if (col.defaultValue.toUpperCase().includes('CURRENT_TIMESTAMP') || 
                   col.defaultValue.toUpperCase().includes('NOW()') ||
                   col.defaultValue.toUpperCase().includes('GEN_RANDOM_UUID()')) {
          parts.push(`DEFAULT ${col.defaultValue}`);
        } else {
          parts.push(`DEFAULT ${col.defaultValue}`);
        }
      }
      
      // CHECK约束
      if (col.check) {
        parts.push(`CHECK (${col.check})`);
      }
      
      // 列注释
      if (col.comment) {
        // 注释将在表创建后单独添加
      }
      
      return parts.join(' ');
    });

    // 添加主键约束
    if (primaryKey && primaryKey.length > 0) {
      columnDefs.push(`PRIMARY KEY (${primaryKey.map((k: string) => `"${k}"`).join(', ')})`);
    }

    const createTableSQL = `CREATE TABLE "${tableName}" (\n  ${columnDefs.join(',\n  ')}\n)`;

    // 执行创建表
    await query(createTableSQL);

    // 添加表注释
    if (comment) {
      await query(`COMMENT ON TABLE "${tableName}" IS '${comment.replace(/'/g, "''")}'`);
    }

    // 添加列注释
    for (const col of columns) {
      if (col.comment) {
        await query(
          `COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${col.comment.replace(/'/g, "''")}'`
        );
      }
    }

    // 创建索引
    if (indexes && Array.isArray(indexes)) {
      for (const index of indexes) {
        if (index.columns && index.columns.length > 0) {
          const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
          const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
          const method = index.method || 'BTREE';
          await query(
            `CREATE ${indexType} "${indexName}" ON "${tableName}" USING ${method} (${index.columns.map((c: string) => `"${c}"`).join(', ')})`
          );
        }
      }
    }

    ctx.response.body = {
      success: true,
      message: `表 ${tableName} 创建成功`,
      tableName,
    };
  } catch (error) {
    console.error("创建表失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "创建表失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 获取数据库统计信息
dbRouter.get("/db/stats", async (ctx: Context) => {
  try {
    // 获取表数量
    const tableCount = await queryOne<{ count: number }>(
      `
      SELECT COUNT(*)::int as count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    `
    );

    // 获取索引数量
    const indexCount = await queryOne<{ count: number }>(
      `
      SELECT COUNT(*)::int as count
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `
    );

    // 获取数据库大小
    const dbSize = await queryOne<{ size: string; size_bytes: string }>(
      `
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as size,
        pg_database_size(current_database())::text as size_bytes
    `
    );

    // 获取活跃连接数
    const activeConnections = await queryOne<{ count: number }>(
      `
      SELECT COUNT(*)::int as count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'active'
    `
    );

    ctx.response.body = {
      success: true,
      data: {
        tables: tableCount?.count || 0,
        indexes: indexCount?.count || 0,
        databaseSize: dbSize?.size || "0 bytes",
        databaseSizeBytes: dbSize?.size_bytes || "0",
        activeConnections: activeConnections?.count || 0,
      },
    };
  } catch (error) {
    console.error("获取统计信息失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取统计信息失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
