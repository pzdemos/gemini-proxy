// routes/login/index.ts - 登录页面路由
import { Router, Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";

export const loginRouter = new Router();

// 服务登录页面
loginRouter.get("/login", async (ctx: Context) => {
  try {
    await ctx.send({
      root: `${Deno.cwd()}/routes/login`,
      path: "login.html",
    });
  } catch (e) {
    console.error("Error serving login page:", e);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});
