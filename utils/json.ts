// utils/json.ts - JSON 序列化工具函数

/**
 * 将对象中的 BigInt 和 Date 类型转换为字符串,以支持 JSON 序列化
 * 
 * @param obj - 需要转换的对象、数组或基本类型
 * @returns 转换后的数据,BigInt 转为字符串,Date 转为 ISO 8601 字符串
 * 
 * @example
 * ```ts
 * const data = {
 *   id: 123n,  // BigInt
 *   created_at: new Date(),
 *   name: "test"
 * };
 * const converted = convertBigIntToString(data);
 * // { id: "123", created_at: "2025-11-26T01:00:00.000Z", name: "test" }
 * ```
 */
export function convertBigIntToString(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // 处理 BigInt 类型
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  // 处理 Date 对象
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => convertBigIntToString(item));
  }
  
  // 处理普通对象
  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        converted[key] = convertBigIntToString(obj[key]);
      }
    }
    return converted;
  }
  
  return obj;
}

/**
 * 自定义 JSON 序列化函数,自动处理 BigInt 和 Date 类型
 * 
 * @param obj - 需要序列化的对象
 * @param space - 缩进空格数,用于格式化输出
 * @returns JSON 字符串
 * 
 * @example
 * ```ts
 * const data = { id: 123n, created_at: new Date() };
 * const json = safeJsonStringify(data, 2);
 * ```
 */
export function safeJsonStringify(obj: any, space?: number): string {
  const converted = convertBigIntToString(obj);
  return JSON.stringify(converted, null, space);
}
