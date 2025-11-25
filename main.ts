// main.ts - Deno Google AI API 服务器
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { apiRouter } from "./routes/api.ts";
import { dbRouter } from "./routes/pdb-manage/db.ts";
import { userRouter } from "./routes/user-manage/users.ts";
import { initDatabase, closeDatabase } from "./utils/db.ts";

// 配置
const API_KEY = Deno.env.get("API_KEY");
const PORT = Number(Deno.env.get("PORT")) || 8000;
const ENABLE_DB = Deno.env.get("ENABLE_DB") === "true";

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

// 注册数据库路由（仅在启用数据库时）
if (ENABLE_DB) {
  app.use(dbRouter.routes());
  app.use(dbRouter.allowedMethods());
  
  // 注册用户管理路由
  app.use(userRouter.routes());
  app.use(userRouter.allowedMethods());
}

// 错误处理
app.addEventListener("error", (evt) => {
  console.error("Application error:", evt.error);
});

// 启动服务器
async function startServer() {
  // 可选：初始化数据库连接
  if (ENABLE_DB) {
    try {
      await initDatabase();
      console.log("✅ 数据库连接已初始化");
    } catch (error) {
      console.warn("⚠️ 数据库连接失败，将继续运行（数据库功能将不可用）:", error);
    }
  }

  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API Key configured: ${API_KEY ? "Yes" : "No"}`);
  console.log(`🗄️  Database enabled: ${ENABLE_DB ? "Yes" : "No"}`);

  // 优雅关闭处理
  Deno.addSignalListener("SIGINT", async () => {
    console.log("\n🛑 正在关闭服务器...");
    if (ENABLE_DB) {
      await closeDatabase();
    }
    Deno.exit(0);
  });

  await app.listen({ port: PORT });
}

startServer().catch((error) => {
  console.error("❌ 服务器启动失败:", error);
  Deno.exit(1);
});