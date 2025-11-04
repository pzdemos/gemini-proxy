// main.ts - Deno Google AI API 服务器
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import * as os from "node:os";

// 配置
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";
const PORT = Number(Deno.env.get("PORT")) || 8000;

// Google AI API 配置
const MODEL_NAME = "gemini-2.0-flash-exp"; 
const GOOGLE_AI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// 获取服务器 IP 地址的函数
function getServerIpAddress(): string | undefined {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined; 
}

// 路由
const router = new Router();

// 健康检查端点 - 改为 /api/health
router.get("/api/health", (ctx) => {
  ctx.response.body = {
    status: "ok",
    message: "Google AI API Service is running",
    model: MODEL_NAME,
    timestamp: new Date().toISOString(),
  };
});

// 列出可用模型
router.get("/api/models", async (ctx) => {
  try {
    if (!GOOGLE_AI_API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models`,
      {
        headers: {
          "x-goog-api-key": GOOGLE_AI_API_KEY,
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      ctx.response.status = response.status;
      ctx.response.body = { error: "Failed to fetch models", details: error };
      return;
    }

    const data = await response.json();
    
    const generativeModels = data.models?.filter((model: any) => 
      model.supportedGenerationMethods?.includes("generateContent")
    ) || [];

    ctx.response.body = {
      success: true,
      currentModel: MODEL_NAME,
      availableModels: generativeModels.map((m: any) => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description,
      })),
    };
  } catch (error) {
    console.error("Error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", message: error.message };
  }
});

// Google AI 文本生成端点
router.post("/api/generate", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, maxTokens = 1024, temperature = 0.7 } = body;

    if (!prompt) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt is required" };
      return;
    }

    if (!GOOGLE_AI_API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(GOOGLE_AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_AI_API_KEY,
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
      message: error.message 
    };
  }
});

// 流式生成端点
router.post("/api/generate-stream", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { prompt, temperature = 0.7 } = body;

    if (!prompt) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt is required" };
      return;
    }

    if (!GOOGLE_AI_API_KEY) {
      ctx.response.status = 500;
      ctx.response.body = { error: "API key not configured" };
      return;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-goog-api-key": GOOGLE_AI_API_KEY,
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
          let bracketDepth = 0;
          let inString = false;
          let escapeNext = false;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // 处理剩余的缓冲区
              if (buffer.trim() && buffer.trim() !== ']') {
                console.log("Remaining buffer:", buffer);
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              break;
            }
            
            // 解码新的数据块
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Google 返回的是流式 JSON 数组: [{...},{...},...]
            // 我们需要解析出每个完整的 JSON 对象
            
            while (buffer.length > 0) {
              let objectStart = -1;
              let objectEnd = -1;
              bracketDepth = 0;
              inString = false;
              escapeNext = false;
              
              for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];
                
                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }
                
                if (char === '\\' && inString) {
                  escapeNext = true;
                  continue;
                }
                
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                
                if (!inString) {
                  if (char === '{') {
                    if (bracketDepth === 0) {
                      objectStart = i;
                    }
                    bracketDepth++;
                  } else if (char === '}') {
                    bracketDepth--;
                    if (bracketDepth === 0 && objectStart >= 0) {
                      objectEnd = i + 1;
                      break;
                    }
                  } else if (char === '[' && bracketDepth === 0) {
                    // 跳过数组开头的 [
                    continue;
                  }
                }
              }
              
              if (objectStart >= 0 && objectEnd > objectStart) {
                // 找到了一个完整的 JSON 对象
                const jsonStr = buffer.substring(objectStart, objectEnd);
                
                try {
                  const parsed = JSON.parse(jsonStr);
                  // 发送为 SSE 格式
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                  
                  // 从缓冲区中移除已处理的部分
                  buffer = buffer.substring(objectEnd);
                  
                  // 跳过逗号和空白
                  buffer = buffer.replace(/^[\s,]+/, '');
                } catch (e) {
                  console.error("JSON parse error:", e, "String:", jsonStr);
                  // 解析失败，跳过这个字符，继续尝试
                  buffer = buffer.substring(1);
                }
              } else {
                // 没有找到完整的对象，等待更多数据
                break;
              }
            }
          }
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.enqueue(encoder.encode(`data: {"error": "${error.message}"}\n\n`));
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    });
  } catch (error) {
    console.error("Stream Error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// 应用设置
const app = new Application();

// 中间件
app.use(oakCors());

// 静态文件服务 - 在路由之前
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  
  // 如果是根路径，返回 index.html
  if (path === '/') {
    try {
      const html = await Deno.readTextFile('./index.html');
      ctx.response.type = 'text/html';
      ctx.response.body = html;
      return;
    } catch (error) {
      // 如果 index.html 不存在，继续到 API 路由
      await next();
      return;
    }
  }
  
  // 处理其他静态文件请求
  if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
    try {
      const file = await Deno.readTextFile('.' + path);
      if (path.endsWith('.html')) {
        ctx.response.type = 'text/html';
      } else if (path.endsWith('.js')) {
        ctx.response.type = 'application/javascript';
      } else if (path.endsWith('.css')) {
        ctx.response.type = 'text/css';
      }
      ctx.response.body = file;
      return;
    } catch (error) {
      // 文件不存在，继续到下一个中间件
    }
  }
  
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

// 错误处理
app.addEventListener("error", (evt) => {
  console.error("Application error:", evt.error);
});

// 启动服务器
const serverIp = getServerIpAddress();
const serverUrl = serverIp ? `http://${serverIp}:${PORT}` : `http://localhost:${PORT}`;

console.log(`🚀 Server running on ${serverUrl}`);
console.log(`📝 API Key configured: ${GOOGLE_AI_API_KEY ? "Yes" : "No"}`);

// 使用 await 确保 fetch 请求完成


await app.listen({ port: PORT });