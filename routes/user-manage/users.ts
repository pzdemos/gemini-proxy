// deno-lint-ignore-file
// routes/user-manage/users.ts - 用户管理路由
import { Router, type Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { query, queryOne } from "../../utils/db.ts";
import { convertBigIntToString } from "../../utils/json.ts";
import { generateAccessToken, generateRefreshToken, verifyToken } from "../../utils/jwt.ts";
import { jwtAuth, requireRole } from "../../middleware/auth.ts";
import { hashPassword, verifyPassword } from "../../utils/password.ts";

// 用户数据类型定义
interface User {
  id?: string;
  username: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  password?: string;
  avatar?: string | null;
  bio?: string | null;
  is_active?: boolean;
  role?: number;
  created_at?: Date;
  updated_at?: Date;
}

// 创建用户路由
export const userRouter = new Router();

/**
 * 用户登录接口
 */
userRouter.post("/api/auth/login", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { username, password } = body;

    // 验证必填字段
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户名和密码不能为空",
      };
      return;
    }

    // 查询用户（包含密码）
    const user = await queryOne<User>(
      `SELECT
        id, username, nickname, email, phone, password,
        avatar, bio, is_active, role, created_at, updated_at
      FROM users
      WHERE username = $1`,
      [username]
    );

    if (!user) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "用户名或密码错误",
      };
      return;
    }

    // 检查用户是否激活
    if (!user.is_active) {
      ctx.response.status = 403;
      ctx.response.body = {
        success: false,
        message: "账号已被停用,请联系管理员",
      };
      return;
    }

    // 验证密码
    const passwordMatch = await verifyPassword(password, user.password!);
    if (!passwordMatch) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "用户名或密码错误",
      };
      return;
    }

    // 生成 JWT tokens
    const tokenPayload = {
      userId: String(user.id!), // 转换 BigInt 为 string
      username: user.username,
      email: user.email || "",
      roleId: Number(user.role), // 转换为 number
    };

    const accessToken = await generateAccessToken(tokenPayload);
    const refreshToken = await generateRefreshToken(tokenPayload);

    // 移除密码
    delete user.password;

    ctx.response.body = {
      success: true,
      message: "登录成功",
      data: {
        user: convertBigIntToString(user),
        accessToken,
        refreshToken,
        expiresIn: 86400, // 24 小时（秒）
      },
    };
  } catch (error) {
    console.error("登录失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "登录失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * 刷新访问令牌接口
 * POST /api/auth/refresh
 */
userRouter.post("/api/auth/refresh", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { refreshToken } = body;

    if (!refreshToken) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "刷新令牌不能为空",
      };
      return;
    }

    // 验证刷新令牌
    const payload = await verifyToken(refreshToken);
    
    if (!payload || payload.type !== "refresh") {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "刷新令牌无效或已过期",
      };
      return;
    }

    // 检查用户是否仍然存在且激活
    const user = await queryOne<User>(
      "SELECT id, is_active FROM users WHERE id = $1",
      [payload.userId]
    );

    if (!user || !user.is_active) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "用户不存在或已被停用",
      };
      return;
    }

    // 生成新的访问令牌
    const newAccessToken = await generateAccessToken({
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      roleId: payload.roleId,
    });

    ctx.response.body = {
      success: true,
      message: "令牌刷新成功",
      data: {
        accessToken: newAccessToken,
        expiresIn: 86400,
      },
    };
  } catch (error) {
    console.error("刷新令牌失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "刷新令牌失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * 获取当前登录用户信息
 */
userRouter.get("/api/auth/me", jwtAuth, async (ctx: Context) => {
  try {
    // 从 context state 获取用户信息（由 jwtAuth 中间件设置）
    const jwtUser = (ctx.state as any).user;

    // 从数据库获取最新的用户信息
    const user = await queryOne<User>(
      `SELECT
        id, username, nickname, email, phone, avatar,
        bio, is_active, role, created_at, updated_at
      FROM users
      WHERE id = $1`,
      [jwtUser.userId]
    );

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "用户不存在",
      };
      return;
    }

    ctx.response.body = {
      success: true,
      data: convertBigIntToString(user),
    };
  } catch (error) {
    console.error("获取用户信息失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取用户信息失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 获取所有用户列表（分页）
userRouter.get("/api/users", jwtAuth, async (ctx: Context) => {
  try {
    const url = ctx.request.url;
    const page = Number(url.searchParams.get("page")) || 1;
    const limit = Number(url.searchParams.get("limit")) || 10;
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search") || "";

    // 构建查询条件
    let whereClause = "";
    const params: any[] = [limit, offset];

    if (search) {
      whereClause = "WHERE username ILIKE $3 OR email ILIKE $3 OR nickname ILIKE $3";
      params.push(`%${search}%`);
    }

    // 获取总记录数
    const countQuery = search
      ? `SELECT COUNT(*)::int as count FROM users WHERE username ILIKE $1 OR email ILIKE $1 OR nickname ILIKE $1`
      : `SELECT COUNT(*)::int as count FROM users`;

    const countResult = await queryOne<{ count: number }>(
      countQuery,
      search ? [`%${search}%`] : []
    );

    // 获取用户列表（不返回密码）
    const users = await query<User>(
      `SELECT
        id, username, nickname, email, phone, avatar,
        bio, is_active, role, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      params
    );

    // 转换数据
    const convertedUsers = convertBigIntToString(users);

    ctx.response.body = {
      success: true,
      data: convertedUsers,
      pagination: {
        page,
        limit,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limit),
      },
    };
  } catch (error) {
    console.error("获取用户列表失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取用户列表失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 根据 ID 获取单个用户
userRouter.get("/api/users/:userId", jwtAuth, async (ctx: Context) => {
  try {
    // @ts-ignore: params is defined by Oak router
    const userId = ctx.params?.userId;

    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户 ID 不能为空",
      };
      return;
    }

    const user = await queryOne<User>(
      `SELECT
        id, username, nickname, email, phone, avatar,
        bio, is_active, role, created_at, updated_at
      FROM users
      WHERE id = $1`,
      [userId]
    );

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "用户不存在",
      };
      return;
    }

    ctx.response.body = {
      success: true,
      data: convertBigIntToString(user),
    };
  } catch (error) {
    console.error("获取用户详情失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取用户详情失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 创建新用户（仅管理员）
userRouter.post("/api/users", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { username, email, password, nickname, phone = null, avatar = null, bio = null, is_active = true, role = 0 } = body;

    // 验证必填字段
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户名和密码为必填项",
      };
      return;
    }

    // 验证邮箱格式（如果提供）
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          message: "邮箱格式不正确",
        };
        return;
      }
    }

    // 检查用户名是否已存在
    const existingUser = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM users WHERE username = $1",
      [username]
    );

    if (existingUser && existingUser.count > 0) {
      ctx.response.status = 409;
      ctx.response.body = {
        success: false,
        message: "用户名已存在",
      };
      return;
    }

    // 加密密码
    const hashedPassword = await hashPassword(password);

    // 插入新用户
    const newUser = await queryOne<User>(
      `INSERT INTO users (username, nickname, email, phone, password, avatar, bio, is_active, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, username, nickname, email, phone, avatar, bio, is_active, role, created_at, updated_at`,
      [username, nickname || null, email || null, phone, hashedPassword, avatar, bio, is_active, role]
    );

    ctx.response.status = 201;
    ctx.response.body = {
      success: true,
      message: "用户创建成功",
      data: convertBigIntToString(newUser),
    };
  } catch (error) {
    console.error("创建用户失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "创建用户失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 更新用户信息（仅管理员）
userRouter.put("/api/users/:userId", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    // @ts-ignore: params is defined by Oak router
    const userId = ctx.params?.userId;
    const body = await ctx.request.body({ type: "json" }).value;
    const { username, nickname, email, phone, avatar, bio, is_active, role } = body;

    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户 ID 不能为空",
      };
      return;
    }

    // 检查用户是否存在
    const existingUser = await queryOne<User>(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (!existingUser) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "用户不存在",
      };
      return;
    }

    // 构建更新字段
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      params.push(username);
    }
    if (nickname !== undefined) {
      updates.push(`nickname = $${paramIndex++}`);
      params.push(nickname);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      params.push(avatar);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      params.push(bio);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (updates.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "没有要更新的字段",
      };
      return;
    }

    // 添加 updated_at
    updates.push(`updated_at = NOW()`);
    params.push(userId);

    // 执行更新
    const updatedUser = await queryOne<User>(
      `UPDATE users
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, username, nickname, email, phone, avatar, bio, is_active, role, created_at, updated_at`,
      params
    );

    ctx.response.body = {
      success: true,
      message: "用户更新成功",
      data: convertBigIntToString(updatedUser),
    };
  } catch (error) {
    console.error("更新用户失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "更新用户失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 更新用户密码（仅管理员）
userRouter.patch("/api/users/:userId/password", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    // @ts-ignore: params is defined by Oak router
    const userId = ctx.params?.userId;
    const body = await ctx.request.body({ type: "json" }).value;
    const { password } = body;

    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户 ID 不能为空",
      };
      return;
    }

    if (!password || password.length < 6) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "密码长度至少为 6 位",
      };
      return;
    }

    // 检查用户是否存在
    const existingUser = await queryOne<User>(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (!existingUser) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "用户不存在",
      };
      return;
    }

    // 加密新密码
    const hashedPassword = await hashPassword(password);

    // 更新密码
    await query(
      `UPDATE users
      SET password = $1, updated_at = NOW()
      WHERE id = $2`,
      [hashedPassword, userId]
    );

    ctx.response.body = {
      success: true,
      message: "密码更新成功",
    };
  } catch (error) {
    console.error("更新密码失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "更新密码失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 删除用户（软删除 - 设置为不活跃）（仅管理员）
userRouter.delete("/api/users/:userId", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    // @ts-ignore: params is defined by Oak router
    const userId = ctx.params?.userId;
    const url = ctx.request.url;
    const hardDelete = url.searchParams.get("hard") === "true";

    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户 ID 不能为空",
      };
      return;
    }

    // 检查用户是否存在
    const existingUser = await queryOne<User>(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (!existingUser) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "用户不存在",
      };
      return;
    }

    if (hardDelete) {
      // 硬删除
      await query("DELETE FROM users WHERE id = $1", [userId]);
      ctx.response.body = {
        success: true,
        message: "用户已永久删除",
      };
    } else {
      // 软删除 - 设置为不活跃
      await query(
        "UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1",
        [userId]
      );
      ctx.response.body = {
        success: true,
        message: "用户已停用",
      };
    }
  } catch (error) {
    console.error("删除用户失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "删除用户失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 批量操作 - 激活/停用用户（仅管理员）
userRouter.patch("/api/users/batch/status", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { userIds, is_active } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "用户 ID 列表不能为空",
      };
      return;
    }

    if (typeof is_active !== "boolean") {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "is_active 必须是布尔值",
      };
      return;
    }

    // 构建 IN 子句
    const placeholders = userIds.map((_: any, i: number) => `$${i + 1}`).join(", ");

    await query(
      `UPDATE users
      SET is_active = $${userIds.length + 1}, updated_at = NOW()
      WHERE id IN (${placeholders})`,
      [...userIds, is_active]
    );

    ctx.response.body = {
      success: true,
      message: `已${is_active ? "激活" : "停用"} ${userIds.length} 个用户`,
    };
  } catch (error) {
    console.error("批量更新用户状态失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "批量更新用户状态失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// 用户统计信息（仅管理员）
userRouter.get("/api/users/stats/summary", jwtAuth, requireRole([1]), async (ctx: Context) => {
  try {
    // 总用户数
    const totalUsers = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM users"
    );

    // 活跃用户数
    const activeUsers = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM users WHERE is_active = true"
    );

    // 今日新增用户
    const todayUsers = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM users WHERE DATE(created_at) = CURRENT_DATE"
    );

    // 本周新增用户
    const weekUsers = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int as count FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
    );

    ctx.response.body = {
      success: true,
      data: {
        total: totalUsers?.count || 0,
        active: activeUsers?.count || 0,
        inactive: (totalUsers?.count || 0) - (activeUsers?.count || 0),
        todayNew: todayUsers?.count || 0,
        weekNew: weekUsers?.count || 0,
      },
    };
  } catch (error) {
    console.error("获取用户统计失败:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "获取用户统计失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
