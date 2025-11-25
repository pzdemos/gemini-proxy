// utils/password.ts - 密码加密工具（兼容 Deno Deploy）
// 使用 Web Crypto API 的 PBKDF2 算法，在所有 Deno 环境中都可用

/**
 * 使用 PBKDF2 算法加密密码
 * @param password 原始密码
 * @returns 加密后的密码哈希（格式：salt:iterations:hash）
 */
export async function hashPassword(password: string): Promise<string> {
  // 生成随机盐
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // 将密码转换为 ArrayBuffer
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  // 使用 PBKDF2 算法（100,000 次迭代，SHA-256）
  const iterations = 100000;
  const hashBuffer = await crypto.subtle.importKey(
    "raw",
    passwordData,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    hashBuffer,
    256 // 256 位 = 32 字节
  );
  
  // 将结果转换为 base64 字符串
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  
  // 返回格式：salt:iterations:hash
  return `${saltBase64}:${iterations}:${hashBase64}`;
}

/**
 * 验证密码
 * @param password 原始密码
 * @param hash 存储的密码哈希
 * @returns 密码是否匹配
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    // 检测是否是旧的 bcrypt 格式（以 $2a$, $2b$, $2y$ 开头）
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      // bcrypt 格式在 Deno Deploy 中不可用
      // 返回 false 并记录警告，建议用户重置密码
      console.warn("检测到旧的 bcrypt 密码哈希，请重置密码以使用新的加密格式");
      return false;
    }
    
    // 解析新的哈希格式：salt:iterations:hash
    const parts = hash.split(":");
    if (parts.length !== 3) {
      // 格式不正确
      console.error("密码哈希格式不正确");
      return false;
    }
    
    const [saltBase64, iterationsStr, hashBase64] = parts;
    const iterations = parseInt(iterationsStr, 10);
    
    // 解码 salt 和 hash
    const salt = Uint8Array.from(
      atob(saltBase64),
      (c) => c.charCodeAt(0)
    );
    // 将密码转换为 ArrayBuffer
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    
    // 使用相同的参数计算哈希
    const hashBuffer = await crypto.subtle.importKey(
      "raw",
      passwordData,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: "SHA-256",
      },
      hashBuffer,
      256
    );
    
    // 比较哈希值
    const computedHash = btoa(
      String.fromCharCode(...new Uint8Array(derivedBits))
    );
    
    return computedHash === hashBase64;
  } catch (error) {
    console.error("密码验证错误:", error);
    return false;
  }
}


