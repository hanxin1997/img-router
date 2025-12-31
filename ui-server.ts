// UI 服务器 - 提供前端静态文件和管理 API
// 端口: 5854 (可配置)

import {
  info, warn, error, debug,
  initLogger, configureLogger, LogLevel,
  getLogFiles, readLogFile, deleteLogFile, clearAllLogs, getLogStats
} from "./logger.ts";
import {
  VolcEngineConfig, GiteeConfig, ModelScopeConfig, HuggingFaceConfig,
  ImageBedConfig, API_TIMEOUT_MS
} from "./config.ts";

// UI 服务端口
const UI_PORT = parseInt(Deno.env.get("UI_PORT") || "5854");

// 数据文件路径
const DATA_DIR = "./data";
const CONFIG_FILE = `${DATA_DIR}/ui-config.json`;

// ==================== 类型定义 ====================
interface ApiKeyConfig {
  id: string;
  name: string;
  value: string;
  provider: string;
  roundRobin: number;
  usedCount: number;
  banned: boolean;
  banExpiry: number | null;
  createdAt: number;
}

interface ModelSizeConfig {
  textToImage: string;
  imageEdit: string;
}

interface UIConfig {
  apiKeys: ApiKeyConfig[];
  settings: {
    activeProvider: string;
    activeModel: string;
    apiPort: number;
    apiTimeout: number;
    imageBedUrl: string;
    imageBedEndpoint: string;   // 上传端点路径
    imageBedAuth: string;
    imageBedFolder: string;     // 上传目录
    imageBedChannel: string;    // 上传渠道
    accessToken: string;  // 后端统一访问密钥
    convertWebpToPng: boolean;  // 是否将 WebP 转换为 PNG
    convertToBase64: boolean;   // 是否将图片转换为 Base64
  };
  modelSizes: Record<string, ModelSizeConfig>;
}

// ==================== 配置管理 ====================
let uiConfig: UIConfig = {
  apiKeys: [],
  settings: {
    activeProvider: 'auto',
    activeModel: '',
    apiPort: 5854,
    apiTimeout: API_TIMEOUT_MS,
    imageBedUrl: ImageBedConfig.baseUrl,
    imageBedEndpoint: ImageBedConfig.uploadEndpoint,
    imageBedAuth: ImageBedConfig.authCode,
    imageBedFolder: ImageBedConfig.uploadFolder,
    imageBedChannel: ImageBedConfig.uploadChannel,
    accessToken: '',  // 默认为空，表示不需要验证
    convertWebpToPng: true,  // 默认开启 WebP 转 PNG
    convertToBase64: true    // 默认开启转换为 Base64
  },
  modelSizes: {}
};

// 加载配置
export async function loadConfig(): Promise<void> {
  try {
    await Deno.mkdir(DATA_DIR, { recursive: true });
    const data = await Deno.readTextFile(CONFIG_FILE);
    uiConfig = JSON.parse(data);
    info("UIServer", `配置已加载: ${uiConfig.apiKeys.length} 个 API Key`);
  } catch {
    info("UIServer", "未找到配置文件，使用默认配置");
    await saveConfig();
  }
}

// 保存配置（返回是否成功）
async function saveConfig(): Promise<boolean> {
  try {
    await Deno.mkdir(DATA_DIR, { recursive: true });
    await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(uiConfig, null, 2));
    debug("UIServer", "配置已保存");
    return true;
  } catch (e) {
    error("UIServer", `保存配置失败: ${e}`);
    return false;
  }
}

// ==================== API Key 轮询管理 ====================
let currentKeyIndex = 0;
let currentKeyUsage = 0;

// 获取下一个可用的 API Key（轮询方式）
export function getNextApiKey(provider?: string): ApiKeyConfig | null {
  // 检查并解除过期封禁
  const now = Date.now();
  uiConfig.apiKeys.forEach(key => {
    if (key.banned && key.banExpiry && now >= key.banExpiry) {
      key.banned = false;
      key.banExpiry = null;
    }
  });

  // 过滤可用的 Key
  let availableKeys = uiConfig.apiKeys.filter(k => !k.banned);
  if (provider && provider !== 'auto') {
    availableKeys = availableKeys.filter(k => k.provider === provider);
  }

  if (availableKeys.length === 0) return null;

  // 轮询逻辑
  if (currentKeyIndex >= availableKeys.length) {
    currentKeyIndex = 0;
  }

  const currentKey = availableKeys[currentKeyIndex];
  currentKeyUsage++;
  currentKey.usedCount = (currentKey.usedCount || 0) + 1;

  // 检查是否需要切换到下一个 Key
  if (currentKeyUsage >= currentKey.roundRobin) {
    currentKeyIndex++;
    currentKeyUsage = 0;
  }

  saveConfig(); // 异步保存
  return currentKey;
}

// 获取指定渠道的模型尺寸配置
export function getModelSize(provider: string, type: 'textToImage' | 'imageEdit'): string {
  const sizes = uiConfig.modelSizes[provider];
  debug("UIServer", `获取 ${provider} 的 ${type} 尺寸, 配置: ${JSON.stringify(sizes)}`);
  if (sizes && sizes[type]) {
    debug("UIServer", `使用 UI 配置尺寸: ${sizes[type]}`);
    return sizes[type];
  }

  // 返回默认尺寸
  switch (provider) {
    case 'VolcEngine':
      return type === 'textToImage' ? VolcEngineConfig.defaultSize : VolcEngineConfig.defaultEditSize;
    case 'Gitee':
      return type === 'textToImage' ? GiteeConfig.defaultSize : GiteeConfig.defaultEditSize;
    case 'ModelScope':
      return type === 'textToImage' ? ModelScopeConfig.defaultSize : ModelScopeConfig.defaultEditSize;
    case 'HuggingFace':
      return type === 'textToImage' ? HuggingFaceConfig.defaultSize : HuggingFaceConfig.defaultEditSize;
    default:
      return '1024x1024';
  }
}

// 获取当前活跃配置
export function getActiveConfig() {
  return uiConfig.settings;
}

// 验证访问密钥
export function validateAccessToken(token: string | null): boolean {
  const configuredToken = uiConfig.settings.accessToken;
  // 如果没有配置访问密钥，则允许所有请求
  if (!configuredToken || configuredToken === '') {
    return true;
  }
  // 验证提供的密钥是否匹配
  return token === configuredToken;
}

// 获取访问密钥（用于检查是否已配置）
export function hasAccessToken(): boolean {
  return !!uiConfig.settings.accessToken && uiConfig.settings.accessToken !== '';
}

// 获取图片转换设置
export function getConversionSettings(): { convertWebpToPng: boolean; convertToBase64: boolean } {
  return {
    convertWebpToPng: uiConfig.settings.convertWebpToPng ?? true,
    convertToBase64: uiConfig.settings.convertToBase64 ?? true
  };
}

// 获取图床配置
export function getImageBedConfig(): {
  baseUrl: string;
  uploadEndpoint: string;
  authCode: string;
  uploadFolder: string;
  uploadChannel: string;
} {
  return {
    baseUrl: uiConfig.settings.imageBedUrl || ImageBedConfig.baseUrl,
    uploadEndpoint: uiConfig.settings.imageBedEndpoint || ImageBedConfig.uploadEndpoint,
    authCode: uiConfig.settings.imageBedAuth || ImageBedConfig.authCode,
    uploadFolder: uiConfig.settings.imageBedFolder || ImageBedConfig.uploadFolder,
    uploadChannel: uiConfig.settings.imageBedChannel || ImageBedConfig.uploadChannel,
  };
}

// ==================== 静态文件服务 ====================
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStaticFile(path: string): Promise<Response> {
  try {
    // 默认返回 index.html
    if (path === '/' || path === '') {
      path = '/index.html';
    }

    const filePath = `./ui${path}`;
    const file = await Deno.readFile(filePath);

    const ext = path.substring(path.lastIndexOf('.'));
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

// ==================== API 处理 ====================

// 验证访问令牌
function verifyAccessToken(req: Request): boolean {
  const accessToken = uiConfig.settings.accessToken;
  if (!accessToken || accessToken === '') {
    return true; // 未设置访问密钥，不需要验证
  }

  // 从 Authorization header 获取 token
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === accessToken;
  }

  return false;
}

// 不需要认证的路径
const PUBLIC_API_PATHS = [
  '/api/auth/check',  // 检查是否需要登录
  '/api/auth/login',  // 登录
];

async function handleApiRequest(req: Request, path: string): Promise<Response> {
  const method = req.method;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  // OPTIONS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API 路由
    switch (true) {
      // ==================== 认证 API（无需验证） ====================

      // 检查是否需要登录
      case path === '/api/auth/check' && method === 'GET': {
        const needsAuth = hasAccessToken();
        return new Response(JSON.stringify({
          needsAuth,
          message: needsAuth ? '需要登录' : '无需登录'
        }), { headers: corsHeaders });
      }

      // 登录验证
      case path === '/api/auth/login' && method === 'POST': {
        const body = await req.json();
        const token = body.token || body.accessToken || '';
        const accessToken = uiConfig.settings.accessToken;

        if (!accessToken || accessToken === '') {
          return new Response(JSON.stringify({ success: true, message: '无需验证' }), { headers: corsHeaders });
        }

        if (token === accessToken) {
          return new Response(JSON.stringify({ success: true, token: accessToken }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: false, error: '访问密钥错误' }), { status: 401, headers: corsHeaders });
      }

      default:
        break;
    }

    // 非公开 API 需要验证访问密钥
    if (!PUBLIC_API_PATHS.includes(path) && !verifyAccessToken(req)) {
      return new Response(JSON.stringify({ error: '未授权访问，请登录' }), { status: 401, headers: corsHeaders });
    }

    // 需要认证的 API 路由
    switch (true) {
      // 获取所有 API Keys
      case path === '/api/keys' && method === 'GET': {
        // 返回时隐藏实际 key 值
        const safeKeys = uiConfig.apiKeys.map(k => ({
          ...k,
          value: k.value.substring(0, 6) + '...' + k.value.substring(k.value.length - 4)
        }));
        return new Response(JSON.stringify(safeKeys), { headers: corsHeaders });
      }

      // 添加 API Key
      case path === '/api/keys' && method === 'POST': {
        const body = await req.json();
        const newKey: ApiKeyConfig = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          name: body.name,
          value: body.value,
          provider: body.provider || detectProvider(body.value),
          roundRobin: body.roundRobin || 1,
          usedCount: 0,
          banned: false,
          banExpiry: null,
          createdAt: Date.now()
        };
        uiConfig.apiKeys.push(newKey);
        const saved = await saveConfig();
        if (!saved) {
          // 回滚添加操作
          uiConfig.apiKeys = uiConfig.apiKeys.filter(k => k.id !== newKey.id);
          return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, id: newKey.id }), { headers: corsHeaders });
      }

      // 删除 API Key
      case path.startsWith('/api/keys/') && method === 'DELETE': {
        const id = path.split('/').pop();
        const originalKeys = [...uiConfig.apiKeys];
        uiConfig.apiKeys = uiConfig.apiKeys.filter(k => k.id !== id);
        const saved = await saveConfig();
        if (!saved) {
          uiConfig.apiKeys = originalKeys;
          return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 封禁 API Key
      case path.match(/\/api\/keys\/[^/]+\/ban/) !== null && method === 'POST': {
        const id = path.split('/')[3];
        const key = uiConfig.apiKeys.find(k => k.id === id);
        if (key) {
          const originalBanned = key.banned;
          const originalBanExpiry = key.banExpiry;
          key.banned = true;
          key.banExpiry = Date.now() + 24 * 60 * 60 * 1000;
          const saved = await saveConfig();
          if (!saved) {
            key.banned = originalBanned;
            key.banExpiry = originalBanExpiry;
            return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
          }
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Key not found' }), { status: 404, headers: corsHeaders });
      }

      // 解禁 API Key
      case path.match(/\/api\/keys\/[^/]+\/unban/) !== null && method === 'POST': {
        const id = path.split('/')[3];
        const key = uiConfig.apiKeys.find(k => k.id === id);
        if (key) {
          const originalBanned = key.banned;
          const originalBanExpiry = key.banExpiry;
          key.banned = false;
          key.banExpiry = null;
          const saved = await saveConfig();
          if (!saved) {
            key.banned = originalBanned;
            key.banExpiry = originalBanExpiry;
            return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
          }
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Key not found' }), { status: 404, headers: corsHeaders });
      }

      // 更新 Key 轮询次数
      case path.match(/\/api\/keys\/[^/]+\/roundrobin/) !== null && method === 'PUT': {
        const id = path.split('/')[3];
        const body = await req.json();
        const key = uiConfig.apiKeys.find(k => k.id === id);
        if (key) {
          const originalRoundRobin = key.roundRobin;
          key.roundRobin = body.roundRobin || 1;
          const saved = await saveConfig();
          if (!saved) {
            key.roundRobin = originalRoundRobin;
            return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
          }
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Key not found' }), { status: 404, headers: corsHeaders });
      }

      // 获取设置
      case path === '/api/settings' && method === 'GET': {
        return new Response(JSON.stringify(uiConfig.settings), { headers: corsHeaders });
      }

      // 更新设置
      case path === '/api/settings' && method === 'PUT': {
        const body = await req.json();
        const originalSettings = { ...uiConfig.settings };
        uiConfig.settings = { ...uiConfig.settings, ...body };
        const saved = await saveConfig();
        if (!saved) {
          uiConfig.settings = originalSettings;
          return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 获取模型尺寸配置
      case path === '/api/model-sizes' && method === 'GET': {
        return new Response(JSON.stringify(uiConfig.modelSizes), { headers: corsHeaders });
      }

      // 更新模型尺寸配置
      case path === '/api/model-sizes' && method === 'PUT': {
        const body = await req.json();
        info("UIServer", `收到尺寸配置更新: ${JSON.stringify(body)}`);
        const originalSizes = { ...uiConfig.modelSizes };
        uiConfig.modelSizes = { ...uiConfig.modelSizes, ...body };
        const saved = await saveConfig();
        if (!saved) {
          uiConfig.modelSizes = originalSizes;
          return new Response(JSON.stringify({ success: false, error: '保存配置失败' }), { status: 500, headers: corsHeaders });
        }
        info("UIServer", `尺寸配置已保存: ${JSON.stringify(uiConfig.modelSizes)}`);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 获取渠道信息
      case path === '/api/providers' && method === 'GET': {
        const providers = {
          VolcEngine: {
            name: '火山引擎',
            models: VolcEngineConfig.supportedModels,
            defaultSize: VolcEngineConfig.defaultSize,
            defaultEditSize: VolcEngineConfig.defaultEditSize
          },
          Gitee: {
            name: 'Gitee (模力方舟)',
            models: [...GiteeConfig.supportedModels, ...GiteeConfig.editModels, ...GiteeConfig.asyncEditModels],
            defaultSize: GiteeConfig.defaultSize,
            defaultEditSize: GiteeConfig.defaultEditSize
          },
          ModelScope: {
            name: 'ModelScope (魔搭)',
            models: [...ModelScopeConfig.supportedModels, ...ModelScopeConfig.editModels],
            defaultSize: ModelScopeConfig.defaultSize,
            defaultEditSize: ModelScopeConfig.defaultEditSize
          },
          HuggingFace: {
            name: 'HuggingFace',
            models: [...HuggingFaceConfig.supportedModels, ...HuggingFaceConfig.editModels],
            defaultSize: HuggingFaceConfig.defaultSize,
            defaultEditSize: HuggingFaceConfig.defaultEditSize
          }
        };
        return new Response(JSON.stringify(providers), { headers: corsHeaders });
      }

      // 健康检查
      case path === '/api/health' && method === 'GET': {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'img-router-ui',
          version: 'v1.7.0',
          keysCount: uiConfig.apiKeys.length,
          activeKeys: uiConfig.apiKeys.filter(k => !k.banned).length
        }), { headers: corsHeaders });
      }

      // 获取统计信息
      case path === '/api/stats' && method === 'GET': {
        const stats = {
          totalKeys: uiConfig.apiKeys.length,
          activeKeys: uiConfig.apiKeys.filter(k => !k.banned).length,
          bannedKeys: uiConfig.apiKeys.filter(k => k.banned).length,
          totalUsage: uiConfig.apiKeys.reduce((sum, k) => sum + (k.usedCount || 0), 0),
          byProvider: {} as Record<string, number>
        };

        uiConfig.apiKeys.forEach(k => {
          stats.byProvider[k.provider] = (stats.byProvider[k.provider] || 0) + 1;
        });

        return new Response(JSON.stringify(stats), { headers: corsHeaders });
      }

      // ==================== 日志管理 API ====================

      // 清理所有日志（保留今天的）- 放在前面避免被 /api/logs/:file 匹配
      case path === '/api/logs/clear' && method === 'POST': {
        const body = await req.json().catch(() => ({}));
        const keepToday = body.keepToday !== false; // 默认保留今天
        const deletedCount = await clearAllLogs(keepToday);
        info("UIServer", `已清理 ${deletedCount} 个日志文件`);
        return new Response(JSON.stringify({ success: true, deletedCount }), { headers: corsHeaders });
      }

      // 获取日志文件列表和统计
      case path === '/api/logs' && method === 'GET': {
        const files = await getLogFiles();
        const stats = await getLogStats();
        return new Response(JSON.stringify({ files, stats }), { headers: corsHeaders });
      }

      // 读取指定日志文件内容
      case path.startsWith('/api/logs/') && path !== '/api/logs/clear' && method === 'GET': {
        const fileName = decodeURIComponent(path.split('/').pop() || '');
        if (!fileName.endsWith('.log')) {
          return new Response(JSON.stringify({ error: 'Invalid log file' }), { status: 400, headers: corsHeaders });
        }

        const url = new URL(req.url);
        const limit = parseInt(url.searchParams.get('limit') || '500');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        const result = await readLogFile(fileName, limit, offset);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // 删除指定日志文件
      case path.startsWith('/api/logs/') && path !== '/api/logs/clear' && method === 'DELETE': {
        const fileName = decodeURIComponent(path.split('/').pop() || '');
        if (!fileName.endsWith('.log')) {
          return new Response(JSON.stringify({ error: 'Invalid log file' }), { status: 400, headers: corsHeaders });
        }

        const success = await deleteLogFile(fileName);
        if (success) {
          info("UIServer", `日志文件已删除: ${fileName}`);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Failed to delete log file' }), { status: 500, headers: corsHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
    }
  } catch (e) {
    error("UIServer", `API 错误: ${e}`);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
}

// 检测 API Key 对应的渠道
function detectProvider(apiKey: string): string {
  if (!apiKey) return 'Unknown';
  if (apiKey.startsWith('hf_')) return 'HuggingFace';
  if (apiKey.startsWith('ms-')) return 'ModelScope';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKey)) return 'VolcEngine';
  if (/^[a-zA-Z0-9]{30,60}$/.test(apiKey)) return 'Gitee';
  return 'Unknown';
}

// ==================== 请求处理 ====================
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // API 请求
  if (path.startsWith('/api/')) {
    return handleApiRequest(req, path);
  }

  // 静态文件
  return serveStaticFile(path);
}

// ==================== 启动服务 ====================
export async function startUIServer() {
  await initLogger();
  await loadConfig();

  info("UIServer", `🎨 UI 服务启动端口 ${UI_PORT}`);
  info("UIServer", `📊 管理界面: http://localhost:${UI_PORT}`);
  info("UIServer", `📡 管理 API: http://localhost:${UI_PORT}/api/`);

  Deno.serve({ port: UI_PORT }, handleRequest);
}

// 如果直接运行此文件
if (import.meta.main) {
  startUIServer();
}
