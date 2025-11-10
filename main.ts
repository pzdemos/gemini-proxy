// main.ts - Deno Google AI API 服务器
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { apiRouter } from "./routes/api.ts";

// 配置
const API_KEY = Deno.env.get("API_KEY");
const PORT = Number(Deno.env.get("PORT"));

// 路由
const router = new Router();


// 健康检查端点
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    message: "Google AI API Service is running",
  };
});

// 应用设置
const app = new Application();

// 中间件
app.use(oakCors());

app.use(router.routes());
app.use(router.allowedMethods());

// 注册 API 路由
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// 错误处理
app.addEventListener("error", (evt) => {
  console.error("Application error:", evt.error);
});

// 启动服务器

console.log(`🚀 Server running on http://localhost:${PORT}`);
console.log(`📝 API Key configured: ${API_KEY ? "Yes" : "No"}`);

await app.listen({ port: PORT });