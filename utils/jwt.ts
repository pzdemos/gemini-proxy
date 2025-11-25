// utils/jwt.ts - JWT 认证工具函数
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// JWT 配置
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "your-secret-key-change-in-production";
const JWT_ALGORITHM = "HS256" as const;
const JWT_EXPIRES_IN = 60 * 60 * 24; // 24 小时（秒）
const JWT_REFRESH_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 天（秒）

// JWT Payload 类型
export interface JwtPayload {
  userId: string;
  username: string;
  email: string;
  roleId: number;
  type?: "access" | "refresh";
}

/**
 * 生成访问令牌（Access Token）
 * 
 * @param payload - JWT 载荷数据
 * @returns JWT 令牌字符串
 */
export async function generateAccessToken(payload: JwtPayload): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return await create(
    { alg: JWT_ALGORITHM, typ: "JWT" },
    {
      ...payload,
      type: "access",
      exp: getNumericDate(JWT_EXPIRES_IN),
      iat: getNumericDate(0),
    },
    key
  );
}

/**
 * 生成刷新令牌（Refresh Token）
 * 
 * @param payload - JWT 载荷数据
 * @returns JWT 刷新令牌字符串
 * 
 * @example
 * ```ts
 * const refreshToken = await generateRefreshToken({
 *   userId: "1",
 *   username: "admin",
 *   email: "admin@example.com",
 *   roleId: 1
 * });
 * ```
 */
export async function generateRefreshToken(payload: JwtPayload): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return await create(
    { alg: JWT_ALGORITHM, typ: "JWT" },
    {
      ...payload,
      type: "refresh",
      exp: getNumericDate(JWT_REFRESH_EXPIRES_IN),
      iat: getNumericDate(0),
    },
    key
  );
}

/**
 * 验证 JWT 令牌
 * 
 * @param token - JWT 令牌字符串
 * @returns 解码后的载荷数据,如果验证失败则返回 null
 * 
 * @example
 * ```ts
 * const payload = await verifyToken(token);
 * if (payload) {
 *   console.log("用户 ID:", payload.userId);
 * }
 * ```
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const payload = await verify(token, key);
    return payload as unknown as JwtPayload;
  } catch (error) {
    console.error("JWT 验证失败:", error);
    return null;
  }
}

/**
 * 从 Authorization 头中提取 Bearer Token
 * 
 * @param authHeader - Authorization 请求头的值
 * @returns 提取的 token,如果格式不正确则返回 null
 * 
 * @example
 * ```ts
 * const token = extractBearerToken("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
 * // 返回: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
