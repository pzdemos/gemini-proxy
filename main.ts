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

// 健康检查端点
router.get("/", (ctx) => {
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

    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");

    const stream = response.body;
    if (stream) {
      ctx.response.body = stream;
    }
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
if (serverIp && serverIp !== '127.0.0.1') {
  try {
    const res = await fetch(`https://ipinfo.io/${serverIp}`);
    const data = await res.json();
    console.log(`🌐 Accessible externally at ${data}`);
  } catch (err) {
    console.error(`Error fetching external IP info: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

await app.listen({ port: PORT });