// 统一入口 - 同时启动 API 服务和 UI 服务
// API 服务端口: 10001 (或 PORT 环境变量)
// UI 服务端口: 5854 (或 UI_PORT 环境变量)

import { startUIServer } from "./ui-server.ts";

// 启动所有服务
async function startAll() {
  console.log("=".repeat(50));
  console.log("  ImgRouter - 智能图像生成网关");
  console.log("=".repeat(50));
  console.log("");

  // 首先启动 UI 服务（加载配置）
  // UI 服务需要先启动，因为 main.ts 依赖其导出的配置函数
  await startUIServer();

  // 然后启动 API 服务（动态导入以确保 UI 配置已加载）
  await import("./main.ts");

  console.log("");
  console.log("所有服务已启动:");
  console.log(`  📡 API 服务: http://localhost:${Deno.env.get("PORT") || "10001"}/v1/chat/completions`);
  console.log(`  🎨 管理界面: http://localhost:${Deno.env.get("UI_PORT") || "5854"}/`);
  console.log("");
}

startAll();
