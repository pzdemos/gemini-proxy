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
const MODEL_NAME = "gemini-2.5-flash"; 
const CHAT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const GOOGLE_AI_BASE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

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
    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, schema, model, maxTokens = 2048, temperature = 0.7 } = body;

    if (!prompt) {
      ctx.response.status = 400;
      ctx.response.body = { error: "提示语不能为空" };
      return;
    }

    if (!API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    // 构建SQL生成的提示词
    let systemPrompt = "你是一个专业的POSTGRESQL查询生成专家。请根据用户的需求生成高质量的SQL语句。";
    if (schema) {
      systemPrompt += `\n\n数据库结构信息：\n${schema}`;
    }
    systemPrompt += "\n\n请生成准确的SQL查询语句，确保语法正确。如果需要更多信息才能生成准确的查询，请说明。";

    const fullPrompt = `${systemPrompt}\n\n用户需求：${prompt}\n\n请生成对应的SQL语句（只需要返回SQL代码，不需要额外解释）：`;

    const response = await fetch(`${GOOGLE_AI_BASE_ENDPOINT}${(model || MODEL_NAME).replace('models/', '')}:generateContent`, {
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
    if (!response.ok) {
      const error = await response.text();
      console.error("Google AI API Error (SQL生成):", error);
      console.error("请求URL:", `${GOOGLE_AI_BASE_ENDPOINT}${(model || MODEL_NAME).replace('models/', '')}:generateContent`);
      console.error("请求payload:", JSON.stringify({
        contents: [{
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens,
        }
      }, null, 2));
      ctx.response.status = response.status;
      ctx.response.body = { error: "生成SQL失败", details: error };
      return;
    }

    const data = await response.json();
    const generatedSQL = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    ctx.response.body = {
      success: true,
      sql: generatedSQL,
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
      error: "生成SQL时发生错误", 
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

