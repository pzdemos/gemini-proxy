// routes/api.ts - API 路由处理
import { Router, type Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";

// 类型定义
interface GoogleModel {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface GoogleModelsResponse {
  models?: GoogleModel[];
}

// 配置
const API_KEY = Deno.env.get("API_KEY") || "";
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const MODEL_NAME = "gemini-2.5-flash";
const CHAT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const GOOGLE_AI_BASE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEEPSEEK_API_ENDPOINT = "https://api.deepseek.com/chat/completions";

// SQL 内容清理函数 - 提取纯 SQL 语句并分离解释
interface SQLCleanResult {
  sql: string;
  explanation: string;
}

function cleanSQLResponse(content: string): SQLCleanResult {
  if (!content) return { sql: "", explanation: "" };

  const originalContent = content.trim();
  let cleaned = originalContent;
  let explanation = "";

  // 1. 提取 Markdown 代码块中的 SQL
  const sqlCodeBlockRegex = /```sql\s*([\s\S]*?)```/i;
  const sqlMatch = cleaned.match(sqlCodeBlockRegex);

  if (sqlMatch && sqlMatch[1]) {
    cleaned = sqlMatch[1].trim();

    // 提取代码块之外的内容作为解释
    const beforeBlock = originalContent.substring(0, sqlMatch.index || 0).trim();
    const afterBlock = originalContent.substring((sqlMatch.index || 0) + sqlMatch[0].length).trim();

    const explanationParts = [];
    if (beforeBlock) explanationParts.push(beforeBlock);
    if (afterBlock) explanationParts.push(afterBlock);
    explanation = explanationParts.join('\n\n');
  } else {
    // 2. 尝试提取通用代码块
    const generalCodeBlockRegex = /```\s*([\s\S]*?)```/;
    const generalMatch = cleaned.match(generalCodeBlockRegex);

    if (generalMatch && generalMatch[1]) {
      cleaned = generalMatch[1].trim();

      // 提取代码块之外的内容作为解释
      const beforeBlock = originalContent.substring(0, generalMatch.index || 0).trim();
      const afterBlock = originalContent.substring((generalMatch.index || 0) + generalMatch[0].length).trim();

      const explanationParts = [];
      if (beforeBlock) explanationParts.push(beforeBlock);
      if (afterBlock) explanationParts.push(afterBlock);
      explanation = explanationParts.join('\n\n');
    }
  }

  // 3. 移除常见的非 SQL 前缀
  const prefixesToRemove = [
    /^这是.*?SQL.*?[:：]\s*/i,
    /^以下是.*?SQL.*?[:：]\s*/i,
    /^SQL.*?[:：]\s*/i,
    /^查询.*?[:：]\s*/i,
  ];

  for (const prefix of prefixesToRemove) {
    const removed = cleaned.match(prefix);
    if (removed && removed[0]) {
      // 将移除的前缀添加到解释中
      if (!explanation && removed[0].trim()) {
        explanation = removed[0].trim();
      }
      cleaned = cleaned.replace(prefix, '');
    }
  }

  // 4. 分离 SQL 语句和解释性文字
  const lines = cleaned.split('\n');
  const sqlLines: string[] = [];
  const explanationLines: string[] = [];
  let foundSQL = false;
  let sqlEnded = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 检测是否是 SQL 语句行
    const isSQLLine = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|WITH|EXPLAIN|ANALYZE)/i.test(trimmedLine) ||
                      /^(FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|GROUP|HAVING|ORDER|LIMIT|OFFSET|SET|VALUES|INTO)/i.test(trimmedLine) ||
                      (foundSQL && !sqlEnded && trimmedLine.length > 0 && !/^(注意|说明|解释|备注|提示|注：|说明：)[:：]/i.test(trimmedLine));

    const isExplanation = /^(注意|说明|解释|备注|提示|注：|说明：)[:：]/i.test(trimmedLine);

    if (isSQLLine) {
      foundSQL = true;
      sqlLines.push(line);

      // 检查是否是 SQL 结束（以分号结尾）
      if (/;$/.test(trimmedLine)) {
        sqlEnded = true;
      }
    } else if (isExplanation || (sqlEnded && trimmedLine.length > 0)) {
      // SQL 结束后的内容作为解释
      explanationLines.push(line);
    } else if (!foundSQL && trimmedLine.length > 0) {
      // SQL 之前的内容作为解释
      explanationLines.push(line);
    } else if (foundSQL && !sqlEnded && trimmedLine.length === 0) {
      // SQL 语句之间的空行保留
      sqlLines.push(line);
    }
  }

  // 组合结果
  const finalSQL = sqlLines.length > 0 ? sqlLines.join('\n').trim() : cleaned;
  const extractedExplanation = explanationLines.join('\n').trim();

  // 合并所有解释内容
  const allExplanations = [explanation, extractedExplanation].filter(e => e.length > 0);
  const finalExplanation = allExplanations.join('\n\n');

  return {
    sql: finalSQL,
    explanation: finalExplanation
  };
}

// DeepSeek API 调用辅助函数
interface DeepSeekResult {
  success: boolean;
  sql?: string;
  explanation?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function callDeepSeekAPI(systemPrompt: string, userPrompt: string): Promise<DeepSeekResult> {
  if (!DEEPSEEK_API_KEY) {
    return {
      success: false,
      error: "DeepSeek API key not configured"
    };
  }

  try {
    const response = await fetch(DEEPSEEK_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        stream: false,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DeepSeek API Error:", errorText);
      return {
        success: false,
        error: `DeepSeek API 返回错误: ${response.status}`,
      };
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

    if (!rawContent) {
      return {
        success: false,
        error: "DeepSeek 未返回有效内容",
      };
    }

    // 清理 SQL 内容，提取纯 SQL 语句和解释
    const cleanedResult = cleanSQLResponse(rawContent);

    if (!cleanedResult.sql) {
      return {
        success: false,
        error: "无法从 DeepSeek 响应中提取有效的 SQL 语句",
      };
    }

    return {
      success: true,
      sql: cleanedResult.sql,
      explanation: cleanedResult.explanation,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      }
    };
  } catch (error) {
    console.error("DeepSeek API 调用失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 创建 API 路由器
export const apiRouter = new Router();

// 列出可用模型
apiRouter.get("/api/models", async (ctx: Context) => {
  try {
    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models`,
        {
          headers: {
            "x-goog-api-key": API_KEY,
          }
        }
    );

    if (!response.ok) {
      const error = await response.text();
      ctx.response.status = response.status;
      ctx.response.body = { error: "Failed to fetch models", details: error };
      return;
    }

    const data = await response.json() as GoogleModelsResponse;

    const generativeModels = data.models?.filter((model: GoogleModel) =>
        model.supportedGenerationMethods?.includes("generateContent")
    ) || [];

    ctx.response.body = {
      success: true,
      currentModel: MODEL_NAME,
      availableModels: generativeModels.map((m: GoogleModel) => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description,
      })),
    };
  } catch (error) {
    console.error("Error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", message: error instanceof Error ? error.message : String(error) };
  }
});

// 新增：为 Nexus App 定制的生成接口
apiRouter.post("/api/nexus-generate", async (ctx: Context) => {
  try {
    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, image, mode } = body;

    if (!mode || (mode !== 'chat' && mode !== 'image')) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Mode ('chat' or 'image') is required" };
      return;
    }
    if (!prompt && !image) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt or image is required" };
      return;
    }

    let model: string;
    const parts = [];

    if (prompt) {
      parts.push({ text: prompt });
    }
    if (image && image.base64 && image.mimeType) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64,
        },
      });
    }

    const payload: { contents: { parts: unknown[] }[], generationConfig?: { responseModalities?: string[] } } = {
      contents: [{ parts }],
    };

    if (mode === 'image') {
      model = IMAGE_MODEL;
      // Fix: Add generationConfig with responseModalities for image generation as required by the model.
      payload.generationConfig = {
        responseModalities: ["IMAGE"],
      };
    } else { // mode === 'chat'
      model = CHAT_MODEL;
    }

    const endpointUrl = `${GOOGLE_AI_BASE_ENDPOINT}${model.replace('models/', '')}:generateContent`;

    const apiResponse = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("Google AI API Error:", errorText);
      ctx.response.status = apiResponse.status;
      // 尝试解析JSON错误，否则返回纯文本
      try {
        ctx.response.body = JSON.parse(errorText);
      } catch {
        ctx.response.body = { error: "Failed to generate response from Google AI", details: errorText };
      }
      return;
    }

    const data = await apiResponse.json();
    ctx.response.body = data; // 直接转发完整响应

  } catch (error) {
    console.error("Error in /api/nexus-generate:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
});

// Google AI 文本生成端点 (旧接口，保持不变)
apiRouter.post("/api/generate", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, maxTokens = 1024, temperature = 0.7 } = body;

    if (!prompt) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt is required" };
      return;
    }

    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(`${GOOGLE_AI_BASE_ENDPOINT}${MODEL_NAME.replace('models/', '')}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens,
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google AI API Error:", error);
      ctx.response.status = response.status;
      ctx.response.body = { error: "Failed to generate response", details: error };
      return;
    }

    const data = await response.json();

    ctx.response.body = {
      success: true,
      response: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      }
    };
  } catch (error) {
    console.error("Error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
});

// AI SQL生成端点
apiRouter.post("/api/sql-generate", async (ctx: Context) => {
  try {
    // 解析请求体
    let body;
    try {
      body = await ctx.request.body({ type: "json" }).value;
    } catch (parseError) {
      console.error("请求体解析失败:", parseError);
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "请求体格式错误",
        message: parseError instanceof Error ? parseError.message : String(parseError)
      };
      return;
    }

    const { prompt, schema, model, maxTokens = 2048, temperature = 0.7 } = body;

    // 验证必需参数
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "提示语不能为空"
      };
      return;
    }

    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "API key not configured"
      };
      return;
    }

    // 构建SQL生成的提示词
    let systemPrompt = `你是一个专业的 PostgreSQL 查询生成专家。请根据用户的需求生成高质量的 SQL 语句。

**重要格式要求：**
1. 将 SQL 代码放在 \`\`\`sql 和 \`\`\` 之间
2. 在代码块之后，可以添加简短的说明（可选）
3. 确保 SQL 语法正确且符合 PostgreSQL 规范

**示例格式：**
\`\`\`sql
SELECT * FROM users WHERE age > 25;
\`\`\`
说明：此查询会返回所有年龄大于25岁的用户记录。`;

    if (schema) {
      systemPrompt += `\n\n**数据库结构信息：**\n${schema}`;
    }

    const fullPrompt = `${systemPrompt}\n\n**用户需求：**${prompt}\n\n请按照上述格式生成 SQL 语句：`;

    // 调用 Google AI API
    let response;
    try {
      response = await fetch(`${GOOGLE_AI_BASE_ENDPOINT}${(model || MODEL_NAME).replace('models/', '')}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens,
          }
        }),
      });
    } catch (fetchError) {
      console.error("Google AI API 请求失败:", fetchError);
      console.log("尝试使用 DeepSeek 备用接口...");

      // 尝试使用 DeepSeek 备用接口
      const deepseekResult = await callDeepSeekAPI(systemPrompt, prompt);

      if (deepseekResult.success) {
        ctx.response.body = {
          success: true,
          sql: deepseekResult.sql,
          explanation: deepseekResult.explanation || "",
          usage: deepseekResult.usage,
          fallback: "deepseek" // 标识使用了备用接口
        };
        return;
      }

      // DeepSeek 也失败了，返回错误
      ctx.response.status = 503;
      ctx.response.body = {
        success: false,
        error: "所有AI服务均不可用",
        googleError: fetchError instanceof Error ? fetchError.message : String(fetchError),
        deepseekError: deepseekResult.error
      };
      return;
    }

    // 检查响应状态
    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.text();
      } catch {
        errorDetails = "无法获取错误详情";
      }

      console.error("Google AI API Error (SQL生成):", errorDetails);
      console.error("请求URL:", `${GOOGLE_AI_BASE_ENDPOINT}${(model || MODEL_NAME).replace('models/', '')}:generateContent`);
      console.error("响应状态:", response.status);
      console.log("尝试使用 DeepSeek 备用接口...");

      // 尝试使用 DeepSeek 备用接口
      const deepseekResult = await callDeepSeekAPI(systemPrompt, prompt);

      console.log("DeepSeek 备用接口结果:", deepseekResult);
      if (deepseekResult.success) {
        ctx.response.body = {
          success: true,
          sql: deepseekResult.sql,
          explanation: deepseekResult.explanation || "",
          usage: deepseekResult.usage,
          fallback: "deepseek" // 标识使用了备用接口
        };
        return;
      }

      // DeepSeek 也失败了，返回错误
      ctx.response.status = response.status;
      ctx.response.body = {
        success: false,
        error: "所有AI服务均不可用",
        googleError: errorDetails,
        deepseekError: deepseekResult.error
      };
      return;
    }

    // 解析响应 JSON
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error("响应 JSON 解析失败:", jsonError);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "AI响应格式错误",
        message: jsonError instanceof Error ? jsonError.message : String(jsonError)
      };
      return;
    }

    // 提取生成的 SQL
    const rawSQL = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    // 验证生成结果
    if (!rawSQL) {
      console.error("AI未返回有效的SQL内容:", JSON.stringify(data, null, 2));
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "AI未能生成有效的SQL",
        details: "返回内容为空"
      };
      return;
    }

    // 清理 SQL 内容，提取纯 SQL 语句和解释
    const cleanedResult = cleanSQLResponse(rawSQL);

    if (!cleanedResult.sql) {
      console.error("无法从AI响应中提取有效的SQL:", rawSQL);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "无法提取有效的SQL语句",
        details: "响应中未找到有效的SQL代码"
      };
      return;
    }

    ctx.response.body = {
      success: true,
      sql: cleanedResult.sql,
      explanation: cleanedResult.explanation || "",
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      }
    };
  } catch (error) {
    console.error("SQL生成错误详情:", error);
    console.error("错误堆栈:", error instanceof Error ? error.stack : "无堆栈信息");
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: "生成SQL时发生未知错误",
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : "无详细错误信息"
    };
  }
});

// AI SQL语法检查端点
apiRouter.post("/api/sql-validate", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { sql, model, maxTokens = 1024, temperature = 0.3 } = body;

    if (!sql) {
      ctx.response.status = 400;
      ctx.response.body = { error: "SQL语句不能为空" };
      return;
    }

    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const validationPrompt = `请检查以下SQL语句的语法是否正确，并提供建议：

SQL语句：
${sql}

请按以下格式回复：
1. 语法是否正确：正确/错误
2. 如果有错误，请指出具体的错误原因和修正建议
3. 提供修正后的SQL语句（如果有）
4. 性能优化建议（如果有）`;

    const response = await fetch(`${GOOGLE_AI_BASE_ENDPOINT}${(model || MODEL_NAME).replace('models/', '')}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: validationPrompt }]
        }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens,
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google AI API Error:", error);
      ctx.response.status = response.status;
      ctx.response.body = { error: "语法检查失败", details: error };
      return;
    }

    const data = await response.json();
    const validationResult = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    // 简单解析验证结果
    const isCorrect = validationResult.toLowerCase().includes("正确") && 
                     !validationResult.toLowerCase().includes("错误");
    
    const hasErrors = validationResult.toLowerCase().includes("错误") || 
                     validationResult.toLowerCase().includes("syntax");

    ctx.response.body = {
      success: true,
      isCorrect: isCorrect,
      hasErrors: hasErrors,
      validationResult: validationResult,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      }
    };
  } catch (error) {
    console.error("Error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "语法检查时发生错误",
      message: error instanceof Error ? error.message : String(error)
    };
  }
});

// 流式生成端点 (旧接口，保持不变)
apiRouter.post("/api/generate-stream", async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, temperature = 0.7 } = body;

    if (!prompt) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt is required" };
      return;
    }

    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(
        `${GOOGLE_AI_BASE_ENDPOINT}${MODEL_NAME.replace('models/', '')}:streamGenerateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature }
          }),
        }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Stream API Error:", error);
      ctx.response.status = response.status;
      ctx.response.body = { error: "Failed to generate stream response", details: error };
      return;
    }

    // 设置 SSE 响应头
    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no"); // 防止 nginx 缓冲

    // 处理流式响应
    const reader = response.body?.getReader();
    if (!reader) {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to get response stream" };
      return;
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    ctx.response.body = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Google API 流返回的是一个 JSON 数组，用 \r\n 或 \n 分隔
            // [ {...}, {...} ]
            // 我们需要逐个解析
            let boundary = buffer.indexOf('\n');
            while (boundary !== -1) {
              const line = buffer.substring(0, boundary).trim();
              buffer = buffer.substring(boundary + 1);

              if (line.startsWith('[') || line.startsWith(']')) {
                // 忽略数组的开始和结束
              } else if (line.endsWith(',')) {
                const jsonStr = line.slice(0, -1);
                try {
                  const parsed = JSON.parse(jsonStr);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                } catch(_e) { /* 忽略解析错误 */ }
              } else if (line) {
                try {
                  const parsed = JSON.parse(line);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                } catch(_e) { /* 忽略解析错误 */ }
              }
              boundary = buffer.indexOf('\n');
            }
          }
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.enqueue(encoder.encode(`data: {"error": "${error instanceof Error ? error.message : String(error)}"}\n\n`));
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    });
  } catch (error) {
    console.error("Stream Error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: error instanceof Error ? error.message : String(error) };
  }
});

