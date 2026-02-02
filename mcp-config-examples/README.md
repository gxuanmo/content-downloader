# MCP 配置指南

已为你安装两个 MCP 服务器：
1. **Context7** - 提供最新的代码文档和示例
2. **Playwright** - 浏览器自动化能力

## 配置方法

### Cursor 用户
配置文件已创建于 `.cursor/mcp.json`
- 打开 Cursor 设置 → Cursor Settings → MCP
- 确保 MCP 已启用
- 重启 Cursor

### VS Code 用户
配置文件已创建于 `.vscode/mcp.json`
- 安装 MCP 扩展（如果还没有）
- 重启 VS Code

### Claude Desktop 用户
复制 `mcp-config-examples/claude-desktop-config.json` 内容到：
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Opencode 用户
复制 `mcp-config-examples/opencode.json` 内容到：
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`
- macOS/Linux: `~/.config/opencode/opencode.json`

### Claude Code 用户
运行以下命令：
```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
claude mcp add playwright -- npx @playwright/mcp@latest
```

## 使用方法

### Context7
在提示词中添加 `use context7` 来获取最新文档：
```
创建一个 Next.js 中间件来验证 JWT。use context7
```

### Playwright
直接在提示词中使用浏览器操作：
```
打开 https://example.com 并截图
```

## 可选配置

### Context7 API Key（推荐）
获取免费 API key: https://context7.com/dashboard
然后在配置中添加：
```json
{
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp", "--api-key", "YOUR_API_KEY"]
}
```

### Playwright 配置选项
可用的命令行参数：
- `--headless` - 无头模式运行
- `--browser <chrome|firefox|webkit>` - 选择浏览器
- `--viewport-size <width>x<height>` - 设置视口大小
- `--device <name>` - 模拟设备（如 "iPhone 15"）
- `--save-trace` - 保存 Playwright trace

完整选项参考：https://github.com/microsoft/playwright-mcp
