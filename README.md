# Gemini AI Chat 代理服务器

一个基于 Deno 的 Google Gemini AI API 代理服务器，配备了现代化的聊天界面。

## 功能特性

### 后端功能
- 🚀 基于 Deno 和 Oak 框架构建
- 🔑 安全的 API 密钥管理
- 📡 支持同步和流式响应
- 🎯 多模型支持（Gemini 2.0 Flash, 1.5 Pro 等）
- 🌐 CORS 支持
- 📊 Token 使用统计

### 前端功能
- 💬 现代化聊天界面（类 OpenRouter 风格）
- 🌊 流式对话支持（Server-Sent Events）
- 🎨 Markdown 渲染和代码高亮
- 🌙 深色/浅色主题切换
- 🎛️ 参数调节（Temperature, Max Tokens）
- 📱 响应式设计
- ⚡ 实时模型切换

## 快速开始

### 环境要求
- Deno 1.38+
- Google AI API Key

### 安装和运行

1. 克隆项目
```bash
git clone <repository-url>
cd gemini-proxy
```

2. 设置环境变量
```bash
# 创建 .env 文件
echo "GOOGLE_AI_API_KEY=your-api-key-here" > .env
```

3. 启动服务器

开发模式（支持热重载）：
```bash
deno task dev
```

生产模式：
```bash
deno task start
```

4. 访问应用
```
http://localhost:8000
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 前端聊天界面 |
| `/api/health` | GET | 健康检查 |
| `/api/models` | GET | 获取可用模型列表 |
| `/api/generate` | POST | 同步文本生成 |
| `/api/generate-stream` | POST | 流式文本生成 |

### 请求示例

#### 同步生成
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, how are you?",
    "temperature": 0.7,
    "maxTokens": 1024
  }'
```

#### 获取模型列表
```bash
curl http://localhost:8000/api/models
```

## 配置选项

### 环境变量
- `GOOGLE_AI_API_KEY`: Google AI API 密钥（必需）
- `PORT`: 服务器端口（默认: 8000）

### 前端参数
- **Temperature**: 0-2（控制创造性，默认: 0.7）
- **Max Tokens**: 100-4096（最大输出长度，默认: 1024）
- **Stream Mode**: 开启/关闭流式输出

## 项目结构

```
gemini-proxy/
├── main.ts          # 服务器主文件
├── index.html       # 前端聊天界面
├── deno.json        # Deno 配置
├── deno.lock        # 依赖锁文件
├── .env             # 环境变量（需创建）
├── .gitignore       # Git 忽略配置
└── README.md        # 项目说明
```

## 技术栈

### 后端
- **Deno**: 安全的 JavaScript/TypeScript 运行时
- **Oak**: Web 框架
- **Google Generative AI**: Gemini 模型 API

### 前端
- **Vue 3**: 响应式框架
- **Tailwind CSS**: 实用优先的 CSS 框架
- **Marked.js**: Markdown 解析
- **Highlight.js**: 代码高亮
- **Axios**: HTTP 客户端

## 部署

### Deno Deploy
项目已配置支持 Deno Deploy：

```bash
deno deploy
```

### Docker（可选）
```dockerfile
FROM denoland/deno:1.38.0

WORKDIR /app
COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", "main.ts"]
```

## 安全注意事项

1. **API 密钥保护**: 永远不要在前端暴露 API 密钥
2. **HTTPS**: 生产环境建议使用 HTTPS
3. **访问控制**: 考虑添加认证机制
4. **速率限制**: 防止 API 滥用

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请提交 Issue 或联系维护者。
