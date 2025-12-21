// 三合一图像生成 API 中转服务
// 支持：火山引擎 (VolcEngine)、Gitee (模力方舟)、ModelScope (魔塔)
// 路由策略：根据 API Key 格式自动分发

// ================= 配置常量 =================

// 1. 火山引擎配置
const VOLC_API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

// 2. Gitee 配置
const GITEE_API_URL = "https://ai.gitee.com/v1/images/generations";
const GITEE_DEFAULT_MODEL = "z-image-turbo";

// 3. ModelScope 配置
const MODELSCOPE_API_URL = "https://api-inference.modelscope.cn/v1";
const MODELSCOPE_DEFAULT_MODEL = "Tongyi-MAI/Z-Image-Turbo";

// 端口配置
const PORT = parseInt(Deno.env.get("PORT") || "10001");

// ================= 类型定义 =================

type Provider = "VolcEngine" | "Gitee" | "ModelScope" | "Unknown";

interface ChatRequest {
  model?: string;
  messages: { role: string; content: string | any[] }[];
  stream?: boolean;
  size?: string;
  [key: string]: any;
}

// ================= 核心逻辑 =================

/**
 * 根据 API Key 格式识别渠道
 */
function detectProvider(apiKey: string): Provider {
  if (!apiKey) return "Unknown";

  // ModelScope: 以 ms- 开头
  if (apiKey.startsWith("ms-")) {
    return "ModelScope";
  }

  // 火山引擎: UUID 格式 (36位，包含 -)
  // 例如: YOUR-UUID-HERE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(apiKey)) {
    return "VolcEngine";
  }

  // Gitee: 40位纯字母数字
  // 例如: YOUR-GITEE-KEY-HERE
  // Gitee: 通常是 40 位纯字母数字，但也可能稍有不同，放宽到 30-60 位
  // 例如: YOUR-GITEE-KEY-HERE
  const giteeRegex = /^[a-zA-Z0-9]{30,60}$/;
  if (giteeRegex.test(apiKey)) {
    return "Gitee";
  }

  return "Unknown";
}

/**
 * 提取 Prompt 和 Images
 */
function extractPromptAndImages(messages: any[]): { prompt: string; images: string[] } {
  let prompt = "";
  let images: string[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const userContent = messages[i].content;
      if (typeof userContent === "string") {
        prompt = userContent;
      } else if (Array.isArray(userContent)) {
        const textItem = userContent.find((item: any) => item.type === "text");
        prompt = textItem?.text || "";
        
        images = userContent
          .filter((item: any) => item.type === "image_url")
          .map((item: any) => item.image_url?.url || "")
          .filter(Boolean);
      }
      break;
    }
  }
  return { prompt, images };
}

// ================= 渠道处理函数 =================

/**
 * 处理火山引擎请求
 */
async function handleVolcEngine(apiKey: string, reqBody: ChatRequest, prompt: string, images: string[]): Promise<string> {
  console.log("👉 路由至: 火山引擎 (VolcEngine)");
  
  const arkRequest = {
    model: reqBody.model || "doubao-seedream-4-0-250828",
    prompt: prompt || "A beautiful scenery",
    image: images, // 火山引擎支持图生图
    response_format: "url",
    size: reqBody.size || "4096x4096",
    seed: -1,
    stream: false,
    watermark: false,
  };

  const response = await fetch(VOLC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Connection": "close"
    },
    body: JSON.stringify(arkRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VolcEngine API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data?.map((img: { url: string }) => `![Generated Image](${img.url})`).join("\n\n") || "图片生成失败";
}

/**
 * 处理 Gitee 请求
 */
async function handleGitee(apiKey: string, reqBody: ChatRequest, prompt: string): Promise<string> {
  console.log("👉 路由至: Gitee (模力方舟)");
  console.log(`   API Key 长度: ${apiKey.length}, 前4位: ${apiKey.substring(0, 4)}...`);

  const giteeRequest = {
    model: reqBody.model?.includes("z-image") ? reqBody.model : GITEE_DEFAULT_MODEL,
    prompt: prompt || "A beautiful scenery",
    size: reqBody.size || "1024x1024", // Gitee 默认 1024x1024
    n: 1,
    response_format: "url"
  };

  console.log(`   发送请求到: ${GITEE_API_URL}`);
  console.log(`   请求体: ${JSON.stringify(giteeRequest)}`);

  const response = await fetch(GITEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": "Doubao-Seedream-Proxy/1.0"
    },
    body: JSON.stringify(giteeRequest),
  });

  console.log(`   响应状态: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`   Gitee API 错误: ${response.status} - ${errorText}`);
    throw new Error(`Gitee API Error (${response.status}): ${errorText}`);
  }

  const responseText = await response.text();
  console.log(`   原始响应: ${responseText}`);

  const data = JSON.parse(responseText);
  console.log(`   解析后的 data: ${JSON.stringify(data.data)}`);

  // Gitee 返回格式: { data: [{ url: "..." }], created: 123456789 }
  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    console.error(`   Gitee 返回数据格式异常: ${JSON.stringify(data)}`);
    throw new Error(`Gitee API 返回数据格式异常: ${JSON.stringify(data)}`);
  }

  const imageUrls = data.data.map((img: { url?: string; b64_json?: string }) => {
    if (img.url) {
      return `![Generated Image](${img.url})`;
    } else if (img.b64_json) {
      return `![Generated Image](data:image/png;base64,${img.b64_json})`;
    }
    return "";
  }).filter(Boolean);

  const result = imageUrls.join("\n\n");
  console.log(`   生成的图片内容: ${result}`);

  return result || "图片生成失败";
}

/**
 * 处理 ModelScope 请求 (异步轮询)
 */
async function handleModelScope(apiKey: string, reqBody: ChatRequest, prompt: string): Promise<string> {
  console.log("👉 路由至: ModelScope (魔塔)");

  const model = reqBody.model?.includes("Z-Image") ? reqBody.model : MODELSCOPE_DEFAULT_MODEL;
  
  // 1. 提交任务
  const submitResponse = await fetch(`${MODELSCOPE_API_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-ModelScope-Async-Mode": "true" // 强制异步
    },
    body: JSON.stringify({
      model: model,
      prompt: prompt || "A beautiful scenery",
      size: reqBody.size || "2048x2048",
      n: 1
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`ModelScope Submit Error (${submitResponse.status}): ${errorText}`);
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.task_id;
  console.log(`   ModelScope Task ID: ${taskId}, 开始轮询...`);

  // 2. 轮询结果
  const maxAttempts = 60; // 5分钟超时
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒

    const checkResponse = await fetch(`${MODELSCOPE_API_URL}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-ModelScope-Task-Type": "image_generation"
      }
    });

    if (!checkResponse.ok) {
      console.warn(`   ModelScope Polling Warning: ${checkResponse.status}`);
      continue;
    }

    const checkData = await checkResponse.json();
    const status = checkData.task_status;

    if (status === "SUCCEED") {
      console.log("   ModelScope Task SUCCEED!");
      const imageUrls = checkData.output_images || [];
      return imageUrls.map((url: string) => `![Generated Image](${url})`).join("\n\n") || "图片生成失败";
    } else if (status === "FAILED") {
      throw new Error(`ModelScope Task Failed: ${JSON.stringify(checkData)}`);
    } else {
      console.log(`   ModelScope Status: ${status} (Attempt ${i + 1}/${maxAttempts})`);
    }
  }

  throw new Error("ModelScope Task Timeout");
}

// ================= 主处理函数 =================

async function handleChatCompletions(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 1. 路由校验
  if (url.pathname !== "/v1/chat/completions") {
    return new Response(JSON.stringify({ error: "Not found" }), { 
      status: 404, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  // 2. 认证校验与渠道识别
  const authHeader = req.headers.get("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "").trim();
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Authorization header missing" }), { 
      status: 401, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  const provider = detectProvider(apiKey);
  if (provider === "Unknown") {
    return new Response(JSON.stringify({ error: "Invalid API Key format. Could not detect provider." }), { 
      status: 401, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    const requestBody: ChatRequest = await req.json();
    const isStream = requestBody.stream === true;
    const { prompt, images } = extractPromptAndImages(requestBody.messages || []);

    // 3. 分发请求
    let imageContent = "";
    
    switch (provider) {
      case "VolcEngine":
        imageContent = await handleVolcEngine(apiKey, requestBody, prompt, images);
        break;
      case "Gitee":
        imageContent = await handleGitee(apiKey, requestBody, prompt);
        break;
      case "ModelScope":
        imageContent = await handleModelScope(apiKey, requestBody, prompt);
        break;
    }

    // 4. 构造响应
    const responseId = `chatcmpl-${crypto.randomUUID()}`;
    const modelName = requestBody.model || "unknown-model";

    // 处理流式返回 (SSE)
    if (isStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const contentChunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{
              index: 0,
              delta: { role: "assistant", content: imageContent },
              finish_reason: null
            }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));

          const endChunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 处理普通 JSON 返回
    return new Response(JSON.stringify({
      id: responseId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{
        index: 0,
        message: { role: "assistant", content: imageContent },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }), {
      headers: { 
        "Content-Type": "application/json", 
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error(`Proxy Error (${provider}):`, error);
    return new Response(JSON.stringify({ 
      error: { message: errorMessage, type: "server_error", provider: provider } 
    }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }
}

// ================= 启动服务 =================

console.log(`🚀 三合一图像生成 API 中转服务 (v2.0) 启动在端口 ${PORT}`);
console.log(`   支持渠道: 火山引擎, Gitee, ModelScope`);
console.log(`   注意: 请确保已重启服务以加载最新代码！`);

Deno.serve({ port: PORT }, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return handleChatCompletions(req);
});
