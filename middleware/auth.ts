// middleware/auth.ts - JWT 认证中间件
import { Context, Next } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verifyToken, extractBearerToken } from "../utils/jwt.ts";

/**
 * JWT 认证中间件
 * 验证请求中的 JWT token,并将用户信息存储到 ctx.state.user
 * 
 * @param ctx - Oak Context 对象
 * @param next - 下一个中间件函数
 * 
 * @example
 * ```ts
 * // 在路由中使用
 * router.get("/protected", jwtAuth, async (ctx) => {
 *   const user = ctx.state.user;
 *   ctx.response.body = { message: `Hello ${user.username}` };
 * });
 * ```
 */
export async function jwtAuth(ctx: Context, next: Next) {
  try {
    // 从请求头中获取 Authorization
    const authHeader = ctx.request.headers.get("Authorization");
    
    // 提取 Bearer Token
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "未提供认证令牌",
        error: "Authorization header is missing or invalid",
      };
      return;
    }

    // 验证 token
    const payload = await verifyToken(token);
    
    if (!payload) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "认证令牌无效或已过期",
        error: "Invalid or expired token",
      };
      return;
    }

    // 检查是否为访问令牌
    if (payload.type !== "access") {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "令牌类型错误",
        error: "Expected access token",
      };
      return;
    }

    // 将用户信息存储到 context state
    // deno-lint-ignore no-explicit-any
    (ctx.state as any).user = payload;

    // 继续执行下一个中间件
    await next();
  } catch (error) {
    console.error("JWT 认证中间件错误:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "认证过程发生错误",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 可选的 JWT 认证中间件
 * 如果提供了有效的 token 则验证,否则继续执行但不设置 user
 * 
 * @param ctx - Oak Context 对象
 * @param next - 下一个中间件函数
 * 
 * @example
 * ```ts
 * // 在路由中使用
 * router.get("/optional-auth", optionalJwtAuth, async (ctx) => {
 *   const user = ctx.state.user;
 *   if (user) {
 *     ctx.response.body = { message: `Hello ${user.username}` };
 *   } else {
 *     ctx.response.body = { message: "Hello Guest" };
 *   }
 * });
 * ```
 */
export async function optionalJwtAuth(ctx: Context, next: Next) {
  try {
    const authHeader = ctx.request.headers.get("Authorization");
    const token = extractBearerToken(authHeader);
    
    if (token) {
      const payload = await verifyToken(token);
      if (payload && payload.type === "access") {
        // deno-lint-ignore no-explicit-any
        (ctx.state as any).user = payload;
      }
    }

    await next();
  } catch (error) {
    console.error("可选 JWT 认证中间件错误:", error);
    // 即使出错也继续执行,不阻塞请求
    await next();
  }
}

/**
 * 角色权限检查中间件工厂函数
 * 检查用户是否具有指定的角色权限
 * 
 * @param allowedRoles - 允许访问的角色 ID 数组
 * @returns 中间件函数
 * 
 * @example
 * ```ts
 * // 只允许管理员访问
 * router.delete("/users/:id", jwtAuth, requireRole([1]), async (ctx) => {
 *   // 删除用户逻辑
 * });
 * ```
 */
export function requireRole(allowedRoles: number[]) {
  return async (ctx: Context, next: Next) => {
    // deno-lint-ignore no-explicit-any
    const user = (ctx.state as any).user;

    if (!user) {
      ctx.response.status = 401;
      ctx.response.body = {
        success: false,
        message: "未认证",
        error: "User not authenticated",
      };
      return;
    }

    if (!allowedRoles.includes(user.roleId)) {
      ctx.response.status = 403;
      ctx.response.body = {
        success: false,
        message: "权限不足",
        error: `Required role: ${allowedRoles.join(" or ")}, but user has role: ${user.roleId}`,
      };
      return;
    }

    await next();
  };
}
