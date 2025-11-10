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

    const endpointUrl = `${GOOGLE_AI_BASE_ENDPOINT}${model}:generateContent`;

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

    const response = await fetch(`${GOOGLE_AI_BASE_ENDPOINT}${MODEL_NAME}:generateContent`, {
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
        `${GOOGLE_AI_BASE_ENDPOINT}${MODEL_NAME}:streamGenerateContent`,
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

