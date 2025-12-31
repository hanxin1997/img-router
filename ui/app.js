// ImgRouter 控制面板 - 前端应用

// ==================== 配置 ====================
// 动态获取 API 地址，支持 Docker 和远程访问
const API_BASE = window.location.origin;

// ==================== 状态管理 ====================
const state = {
  apiKeys: [],
  settings: {
    activeProvider: 'auto',
    activeModel: '',
    apiPort: 5854,
    apiTimeout: 300000,
    imageBedUrl: '',
    imageBedEndpoint: '',
    imageBedAuth: '',
    imageBedFolder: '',
    imageBedChannel: '',
    accessToken: '',
    convertWebpToPng: true,
    convertToBase64: true
  },
  modelSizes: {},
  theme: localStorage.getItem('theme') || 'light'
};

// 渠道与模型配置
const providerModels = {
  VolcEngine: {
    name: '火山引擎 (VolcEngine)',
    textToImage: ['doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828'],
    imageEdit: ['doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828'],
    defaultSize: '2K',
    defaultEditSize: '2K',
    sizes: ['512x512', '1024x1024', '2K', '4K']
  },
  Gitee: {
    name: 'Gitee (模力方舟)',
    textToImage: ['z-image-turbo'],
    imageEdit: ['Qwen-Image-Edit', 'HiDream-E1-Full', 'FLUX.1-dev', 'FLUX.2-dev', 'FLUX.1-Kontext-dev', 'HelloMeme', 'Kolors', 'OmniConsistency', 'InstantCharacter', 'DreamO', 'LongCat-Image-Edit', 'AnimeSharp'],
    asyncEdit: ['Qwen-Image-Edit-2511', 'LongCat-Image-Edit', 'FLUX.1-Kontext-dev'],
    defaultSize: '2048x2048',
    defaultEditSize: '1024x1024',
    sizes: ['512x512', '1024x1024', '2048x2048']
  },
  ModelScope: {
    name: 'ModelScope (魔搭)',
    textToImage: ['Tongyi-MAI/Z-Image-Turbo'],
    imageEdit: ['Qwen/Qwen-Image-Edit-2511'],
    defaultSize: '1024x1024',
    defaultEditSize: '1328x1328',
    sizes: ['512x512', '1024x1024', '1328x1328', '2048x2048']
  },
  HuggingFace: {
    name: 'HuggingFace',
    textToImage: ['z-image-turbo'],
    imageEdit: ['Qwen-Image-Edit-2511'],
    defaultSize: '1024x1024',
    defaultEditSize: '1024x1024',
    sizes: ['512x512', '768x768', '1024x1024']
  }
};

// ==================== 工具函数 ====================
function detectProvider(apiKey) {
  if (!apiKey) return 'Unknown';
  if (apiKey.startsWith('hf_')) return 'HuggingFace';
  if (apiKey.startsWith('ms-')) return 'ModelScope';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKey)) return 'VolcEngine';
  if (/^[a-zA-Z0-9]{30,60}$/.test(apiKey)) return 'Gitee';
  return 'Unknown';
}

function maskKey(key) {
  if (!key || key.length < 12) return '****';
  return key.substring(0, 6) + '...' + key.substring(key.length - 4);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTimeRemaining(endTime) {
  const now = Date.now();
  const remaining = endTime - now;
  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}小时 ${minutes}分钟后解禁`;
}

// ==================== 存储 ====================
function saveState() {
  localStorage.setItem('imgRouterState', JSON.stringify({
    apiKeys: state.apiKeys,
    settings: state.settings,
    modelSizes: state.modelSizes
  }));
}

function loadState() {
  const saved = localStorage.getItem('imgRouterState');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.apiKeys = data.apiKeys || [];
      state.settings = { ...state.settings, ...data.settings };
      state.modelSizes = data.modelSizes || {};
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }
  // 初始化模型尺寸配置
  initModelSizes();
}

function initModelSizes() {
  for (const [provider, config] of Object.entries(providerModels)) {
    if (!state.modelSizes[provider]) {
      state.modelSizes[provider] = {
        textToImage: config.defaultSize,
        imageEdit: config.defaultEditSize
      };
    }
  }
}

// ==================== Toast 通知 ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== 页面导航 ====================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');

  const pageTitles = {
    'dashboard': '仪表盘',
    'api-keys': 'API 密钥',
    'models': '模型配置',
    'settings': '系统设置',
    'logs': '日志查看'
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageName = item.dataset.page;

      // 更新导航状态
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // 切换页面
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(`page-${pageName}`).classList.add('active');

      // 更新标题
      pageTitle.textContent = pageTitles[pageName];

      // 切换到日志页面时刷新日志列表
      if (pageName === 'logs') {
        loadLogFiles();
      }

      // 移动端关闭侧边栏
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // 移动端菜单
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

// ==================== 主题切换 ====================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();

  document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('theme', state.theme);
    updateThemeIcon();
  });
}

function updateThemeIcon() {
  const icon = document.querySelector('#themeToggle .material-icons');
  icon.textContent = state.theme === 'light' ? 'dark_mode' : 'light_mode';
}

// ==================== API 密钥管理 ====================
function renderApiKeys() {
  const tbody = document.getElementById('apiKeysTable');
  const emptyState = document.getElementById('emptyKeysState');

  // 检查并解除过期封禁
  state.apiKeys.forEach(key => {
    if (key.banned && key.banExpiry && Date.now() >= key.banExpiry) {
      key.banned = false;
      key.banExpiry = null;
    }
  });

  if (state.apiKeys.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  tbody.innerHTML = state.apiKeys.map(key => {
    const provider = detectProvider(key.value);
    const providerConfig = providerModels[provider];
    const banTimeRemaining = key.banned && key.banExpiry ? formatTimeRemaining(key.banExpiry) : null;

    return `
      <tr data-id="${key.id}">
        <td>
          <div class="key-name">${key.name}</div>
          <div class="key-preview">${maskKey(key.value)}</div>
        </td>
        <td>
          <span class="chip chip-primary">${providerConfig ? providerConfig.name : provider}</span>
        </td>
        <td>${key.roundRobin || 1}</td>
        <td>${key.usedCount || 0}</td>
        <td>
          ${key.banned
            ? `<span class="status-badge status-banned">已封禁</span>${banTimeRemaining ? `<span class="ban-timer">${banTimeRemaining}</span>` : ''}`
            : '<span class="status-badge status-active">正常</span>'
          }
        </td>
        <td>
          <div class="actions-cell">
            ${key.banned
              ? `<button class="btn-icon" onclick="unbanKey('${key.id}')" title="解禁">
                  <span class="material-icons">lock_open</span>
                </button>`
              : `<button class="btn-icon" onclick="banKey('${key.id}')" title="封禁24小时">
                  <span class="material-icons">block</span>
                </button>`
            }
            <button class="btn-icon danger" onclick="deleteKey('${key.id}')" title="删除">
              <span class="material-icons">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updateStats();
  saveState();
}

async function addKey(name, value, roundRobin) {
  const provider = detectProvider(value);
  if (provider === 'Unknown') {
    showToast('无法识别的 API Key 格式', 'error');
    return false;
  }

  const newKey = {
    id: generateId(),
    name,
    value,
    provider,
    roundRobin: parseInt(roundRobin) || 1,
    usedCount: 0,
    banned: false,
    banExpiry: null,
    createdAt: Date.now()
  };

  // 同步保存到服务器
  try {
    const response = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newKey)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      showToast(err.error || '保存到服务器失败', 'error');
      return false;
    }

    const result = await response.json();
    newKey.id = result.id || newKey.id; // 使用服务器返回的 ID
  } catch (err) {
    console.error('Failed to save key to server:', err);
    showToast('网络错误，密钥仅保存在本地', 'error');
  }

  state.apiKeys.push(newKey);
  renderApiKeys();
  showToast(`已添加 ${provider} 密钥: ${name}`, 'success');
  return true;
}

async function deleteKey(id) {
  const key = state.apiKeys.find(k => k.id === id);
  if (key && confirm(`确定删除密钥 "${key.name}" 吗？`)) {
    // 同步删除到服务器
    try {
      const response = await fetch(`${API_BASE}/api/keys/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        showToast('从服务器删除失败', 'error');
        return;
      }
    } catch (err) {
      console.error('Failed to delete key from server:', err);
      showToast('网络错误，删除失败', 'error');
      return;
    }

    state.apiKeys = state.apiKeys.filter(k => k.id !== id);
    renderApiKeys();
    showToast('密钥已删除', 'success');
  }
}

async function banKey(id) {
  const key = state.apiKeys.find(k => k.id === id);
  if (key) {
    // 同步封禁到服务器
    try {
      const response = await fetch(`${API_BASE}/api/keys/${id}/ban`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        showToast('封禁失败', 'error');
        return;
      }
    } catch (err) {
      console.error('Failed to ban key on server:', err);
      showToast('网络错误，封禁失败', 'error');
      return;
    }

    key.banned = true;
    key.banExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24小时
    renderApiKeys();
    showToast(`已封禁密钥 "${key.name}" 24小时`, 'success');
  }
}

async function unbanKey(id) {
  const key = state.apiKeys.find(k => k.id === id);
  if (key) {
    // 同步解禁到服务器
    try {
      const response = await fetch(`${API_BASE}/api/keys/${id}/unban`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        showToast('解禁失败', 'error');
        return;
      }
    } catch (err) {
      console.error('Failed to unban key on server:', err);
      showToast('网络错误，解禁失败', 'error');
      return;
    }

    key.banned = false;
    key.banExpiry = null;
    renderApiKeys();
    showToast(`已解禁密钥 "${key.name}"`, 'success');
  }
}

// 暴露到全局
window.deleteKey = deleteKey;
window.banKey = banKey;
window.unbanKey = unbanKey;

function updateStats() {
  document.getElementById('totalKeys').textContent = state.apiKeys.length;
  document.getElementById('activeKeys').textContent = state.apiKeys.filter(k => !k.banned).length;
  document.getElementById('bannedKeys').textContent = state.apiKeys.filter(k => k.banned).length;
}

function initAddKeyModal() {
  const modal = document.getElementById('addKeyModal');
  const keyValueInput = document.getElementById('keyValue');
  const providerHint = document.getElementById('keyProviderHint');

  // 打开模态框
  const openModal = () => modal.classList.add('active');
  const closeModal = () => {
    modal.classList.remove('active');
    document.getElementById('keyName').value = '';
    document.getElementById('keyValue').value = '';
    document.getElementById('keyRoundRobin').value = '1';
    providerHint.textContent = '系统将根据 Key 格式自动识别渠道';
  };

  document.getElementById('addKeyBtn').addEventListener('click', openModal);
  document.getElementById('addKeyBtn2').addEventListener('click', openModal);
  document.getElementById('closeAddKeyModal').addEventListener('click', closeModal);
  document.getElementById('cancelAddKey').addEventListener('click', closeModal);

  // 实时检测渠道
  keyValueInput.addEventListener('input', (e) => {
    const provider = detectProvider(e.target.value);
    if (provider === 'Unknown') {
      providerHint.textContent = '系统将根据 Key 格式自动识别渠道';
      providerHint.style.color = '';
    } else {
      const config = providerModels[provider];
      providerHint.textContent = `已识别: ${config ? config.name : provider}`;
      providerHint.style.color = 'var(--md-primary)';
    }
  });

  // 确认添加
  document.getElementById('confirmAddKey').addEventListener('click', async () => {
    const name = document.getElementById('keyName').value.trim();
    const value = document.getElementById('keyValue').value.trim();
    const roundRobin = document.getElementById('keyRoundRobin').value;

    if (!name) {
      showToast('请输入密钥名称', 'error');
      return;
    }
    if (!value) {
      showToast('请输入 API Key', 'error');
      return;
    }

    const success = await addKey(name, value, roundRobin);
    if (success) {
      closeModal();
    }
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// ==================== 模型配置 ====================
function renderModelConfig() {
  const providerSelect = document.getElementById('activeProvider');
  const modelSelect = document.getElementById('activeModel');

  // 渠道变更时更新模型列表
  providerSelect.addEventListener('change', (e) => {
    state.settings.activeProvider = e.target.value;
    updateModelOptions();
    saveState();
  });

  modelSelect.addEventListener('change', (e) => {
    state.settings.activeModel = e.target.value;
    saveState();
  });

  // 初始化模型选项
  updateModelOptions();

  // 渲染尺寸配置
  renderSizeConfigs();
}

function updateModelOptions() {
  const modelSelect = document.getElementById('activeModel');
  const provider = state.settings.activeProvider;

  if (provider === 'auto') {
    modelSelect.innerHTML = '<option value="">自动选择（根据 Key 决定）</option>';
    return;
  }

  const config = providerModels[provider];
  if (!config) return;

  const allModels = [...new Set([
    ...config.textToImage,
    ...config.imageEdit,
    ...(config.asyncEdit || [])
  ])];

  modelSelect.innerHTML = allModels.map(model =>
    `<option value="${model}" ${state.settings.activeModel === model ? 'selected' : ''}>${model}</option>`
  ).join('');
}

function renderSizeConfigs() {
  const container = document.getElementById('sizeConfigs');

  container.innerHTML = Object.entries(providerModels).map(([provider, config]) => {
    const sizes = state.modelSizes[provider] || {};

    return `
      <div class="size-config-item">
        <h4>${config.name}</h4>
        <div class="form-group">
          <label>文生图尺寸</label>
          <select class="form-select" data-provider="${provider}" data-type="textToImage">
            ${config.sizes.map(size =>
              `<option value="${size}" ${sizes.textToImage === size ? 'selected' : ''}>${size}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>图生图尺寸</label>
          <select class="form-select" data-provider="${provider}" data-type="imageEdit">
            ${config.sizes.map(size =>
              `<option value="${size}" ${sizes.imageEdit === size ? 'selected' : ''}>${size}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `;
  }).join('');

  // 绑定事件
  container.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const provider = e.target.dataset.provider;
      const type = e.target.dataset.type;
      if (!state.modelSizes[provider]) {
        state.modelSizes[provider] = {};
      }
      state.modelSizes[provider][type] = e.target.value;
      saveState();

      // 同步到服务器
      try {
        const response = await fetch(`${API_BASE}/api/model-sizes`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(state.modelSizes)
        });

        if (response.ok) {
          showToast('尺寸配置已保存', 'success');
        } else {
          showToast('保存到服务器失败', 'error');
        }
      } catch (err) {
        console.error('Failed to save model sizes to server:', err);
        showToast('网络错误，尺寸仅保存在本地', 'error');
      }
    });
  });
}

// ==================== 系统设置 ====================
function initSettings() {
  // 加载设置
  document.getElementById('apiPort').value = state.settings.apiPort;
  document.getElementById('apiTimeout').value = state.settings.apiTimeout;
  document.getElementById('imageBedUrl').value = state.settings.imageBedUrl || '';
  document.getElementById('imageBedEndpoint').value = state.settings.imageBedEndpoint || '';
  document.getElementById('imageBedAuth').value = state.settings.imageBedAuth || '';
  document.getElementById('imageBedFolder').value = state.settings.imageBedFolder || '';
  document.getElementById('imageBedChannel').value = state.settings.imageBedChannel || '';
  document.getElementById('accessToken').value = state.settings.accessToken || '';

  // 加载图片处理设置
  document.getElementById('convertWebpToPng').checked = state.settings.convertWebpToPng !== false;
  document.getElementById('convertToBase64').checked = state.settings.convertToBase64 !== false;

  // 访问密钥显示/隐藏切换
  const accessTokenInput = document.getElementById('accessToken');
  const toggleBtn = document.getElementById('toggleAccessToken');

  toggleBtn.addEventListener('click', () => {
    const isPassword = accessTokenInput.type === 'password';
    accessTokenInput.type = isPassword ? 'text' : 'password';
    toggleBtn.querySelector('.material-icons').textContent = isPassword ? 'visibility_off' : 'visibility';
  });

  // 生成随机访问密钥
  document.getElementById('generateAccessToken').addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'sk-';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    accessTokenInput.value = token;
    accessTokenInput.type = 'text'; // 显示生成的密钥
    toggleBtn.querySelector('.material-icons').textContent = 'visibility_off';
    showToast('已生成随机访问密钥', 'success');
  });

  // 保存设置
  document.getElementById('saveSettings').addEventListener('click', async () => {
    // 保存旧的认证 token，用于 API 调用（重要：必须在更新 state.settings 之前保存）
    const oldAuthToken = authState.token;

    state.settings.apiPort = parseInt(document.getElementById('apiPort').value) || 5854;
    state.settings.apiTimeout = parseInt(document.getElementById('apiTimeout').value) || 300000;
    state.settings.imageBedUrl = document.getElementById('imageBedUrl').value;
    state.settings.imageBedEndpoint = document.getElementById('imageBedEndpoint').value;
    state.settings.imageBedAuth = document.getElementById('imageBedAuth').value;
    state.settings.imageBedFolder = document.getElementById('imageBedFolder').value;
    state.settings.imageBedChannel = document.getElementById('imageBedChannel').value;
    state.settings.accessToken = document.getElementById('accessToken').value;
    state.settings.convertWebpToPng = document.getElementById('convertWebpToPng').checked;
    state.settings.convertToBase64 = document.getElementById('convertToBase64').checked;

    saveState();

    // 关键修复：先用旧 token 调用服务器保存设置，成功后再更新本地认证状态
    // 这样可以避免"用新 token 调用服务器，但服务器还保存着旧 token"的认证失败问题
    try {
      // 构建请求头：使用旧 token（如果有的话）
      const headers = { 'Content-Type': 'application/json' };
      if (oldAuthToken) {
        headers['Authorization'] = `Bearer ${oldAuthToken}`;
      }

      const response = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(state.settings)
      });

      if (response.ok) {
        // 服务器保存成功后，再更新本地认证状态
        if (state.settings.accessToken && state.settings.accessToken.trim() !== '') {
          authState.token = state.settings.accessToken;
          authState.isAuthenticated = true;
          localStorage.setItem('authToken', state.settings.accessToken);
        } else {
          authState.token = '';
          authState.isAuthenticated = false;
          localStorage.removeItem('authToken');
        }
        updateAccessTokenStatus();
        showToast('设置已保存到服务器', 'success');
      } else {
        showToast('保存到服务器失败', 'error');
      }
    } catch (err) {
      console.error('Failed to save settings to server:', err);
      // 网络错误时，仍然更新本地状态，以便用户可以继续使用
      if (state.settings.accessToken && state.settings.accessToken.trim() !== '') {
        authState.token = state.settings.accessToken;
        authState.isAuthenticated = true;
        localStorage.setItem('authToken', state.settings.accessToken);
      } else {
        authState.token = '';
        authState.isAuthenticated = false;
        localStorage.removeItem('authToken');
      }
      updateAccessTokenStatus();
      showToast('设置已保存到本地', 'success');
    }
  });
}

// ==================== 定时刷新封禁状态 ====================
function startBanTimer() {
  setInterval(() => {
    let needsUpdate = false;
    state.apiKeys.forEach(key => {
      if (key.banned && key.banExpiry && Date.now() >= key.banExpiry) {
        key.banned = false;
        key.banExpiry = null;
        needsUpdate = true;
      }
    });
    if (needsUpdate) {
      renderApiKeys();
      showToast('部分密钥已自动解禁', 'info');
    }
  }, 60000); // 每分钟检查一次
}

// ==================== 日志管理 ====================
const logState = {
  files: [],
  currentFile: null,
  currentContent: '',
  currentOffset: 0,
  totalLines: 0,
  hasMore: false,
  loading: false
};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getTodayDate() {
  const now = new Date();
  // 转换为北京时间
  const beijingOffset = 8 * 60;
  const localOffset = now.getTimezoneOffset();
  const beijingTime = new Date(now.getTime() + (beijingOffset + localOffset) * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

async function loadLogFiles() {
  if (logState.loading) return;
  logState.loading = true;

  try {
    const response = await fetch(`${API_BASE}/api/logs`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch logs');

    const data = await response.json();
    logState.files = data.files || [];

    renderLogStats(data.stats);
    renderLogFiles();
  } catch (err) {
    console.error('Failed to load log files:', err);
    showToast('加载日志失败', 'error');
  } finally {
    logState.loading = false;
  }
}

function renderLogStats(stats) {
  if (!stats) return;

  document.getElementById('logFilesCount').textContent = stats.totalFiles || 0;
  document.getElementById('logTotalSize').textContent = formatFileSize(stats.totalSize || 0);

  if (stats.oldestDate && stats.newestDate) {
    if (stats.oldestDate === stats.newestDate) {
      document.getElementById('logDateRange').textContent = stats.oldestDate;
    } else {
      document.getElementById('logDateRange').textContent = `${stats.oldestDate} ~ ${stats.newestDate}`;
    }
  } else {
    document.getElementById('logDateRange').textContent = '-';
  }
}

function renderLogFiles() {
  const container = document.getElementById('logFilesList');
  const emptyState = document.getElementById('emptyLogsState');
  const today = getTodayDate();

  if (logState.files.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  container.innerHTML = logState.files.map(file => {
    const isToday = file.date === today;
    return `
      <div class="log-file-item ${isToday ? 'today' : ''}" data-file="${file.name}">
        <div class="log-file-info" onclick="viewLogFile('${file.name}')">
          <div class="log-file-name">
            <span>${file.name}</span>
            ${isToday ? '<span class="chip chip-primary">今天</span>' : ''}
          </div>
          <div class="log-file-meta">
            <span><span class="material-icons" style="font-size: 14px; vertical-align: middle;">storage</span> ${formatFileSize(file.size)}</span>
            <span><span class="material-icons" style="font-size: 14px; vertical-align: middle;">calendar_today</span> ${file.date}</span>
          </div>
        </div>
        <div class="log-file-actions">
          <button class="icon-btn" onclick="viewLogFile('${file.name}')" title="查看">
            <span class="material-icons">visibility</span>
          </button>
          <button class="icon-btn danger" onclick="deleteLogFileUI('${file.name}')" title="删除">
            <span class="material-icons">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function viewLogFile(fileName) {
  logState.currentFile = fileName;
  logState.currentOffset = 0;
  logState.currentContent = '';

  const viewerCard = document.getElementById('logViewerCard');
  const logContent = document.getElementById('logContent');
  const loadMoreBtn = document.getElementById('loadMoreLogs');

  viewerCard.style.display = 'block';
  document.getElementById('logViewerTitle').textContent = fileName;
  logContent.innerHTML = '<span class="loading">加载中...</span>';

  try {
    const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(fileName)}?limit=500&offset=0`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch log content');

    const data = await response.json();
    logState.currentContent = data.content || '';
    logState.totalLines = data.totalLines || 0;
    logState.hasMore = data.hasMore || false;
    logState.currentOffset = 500;

    renderLogContent();
    updateLogLinesInfo();
    loadMoreBtn.style.display = logState.hasMore ? 'inline-flex' : 'none';

    // 滚动到日志查看器
    viewerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('Failed to load log content:', err);
    logContent.innerHTML = '<span class="log-error">加载失败</span>';
    showToast('加载日志内容失败', 'error');
  }
}

function renderLogContent() {
  const logContent = document.getElementById('logContent');
  // 高亮日志级别
  const highlighted = logState.currentContent
    .replace(/\[DEBUG\]/g, '<span class="log-debug">[DEBUG]</span>')
    .replace(/\[INFO\]/g, '<span class="log-info">[INFO]</span>')
    .replace(/\[WARN\]/g, '<span class="log-warn">[WARN]</span>')
    .replace(/\[ERROR\]/g, '<span class="log-error">[ERROR]</span>');

  logContent.innerHTML = highlighted || '<span class="empty">日志为空</span>';
}

function updateLogLinesInfo() {
  const info = document.getElementById('logLinesInfo');
  const displayed = logState.currentContent.split('\n').filter(l => l.trim()).length;
  info.textContent = `显示 ${displayed} / ${logState.totalLines} 行`;
}

async function loadMoreLogContent() {
  if (!logState.currentFile || !logState.hasMore) return;

  const loadMoreBtn = document.getElementById('loadMoreLogs');
  loadMoreBtn.disabled = true;
  loadMoreBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> 加载中...';

  try {
    const response = await fetch(
      `${API_BASE}/api/logs/${encodeURIComponent(logState.currentFile)}?limit=500&offset=${logState.currentOffset}`,
      { headers: getAuthHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch more content');

    const data = await response.json();
    logState.currentContent += '\n' + (data.content || '');
    logState.hasMore = data.hasMore || false;
    logState.currentOffset += 500;

    renderLogContent();
    updateLogLinesInfo();
    loadMoreBtn.style.display = logState.hasMore ? 'inline-flex' : 'none';
  } catch (err) {
    console.error('Failed to load more logs:', err);
    showToast('加载更多日志失败', 'error');
  } finally {
    loadMoreBtn.disabled = false;
    loadMoreBtn.innerHTML = '<span class="material-icons">expand_more</span> 加载更多';
  }
}

function closeLogViewer() {
  document.getElementById('logViewerCard').style.display = 'none';
  logState.currentFile = null;
  logState.currentContent = '';
}

async function deleteLogFileUI(fileName) {
  if (!confirm(`确定删除日志文件 "${fileName}" 吗？`)) return;

  try {
    const response = await fetch(`${API_BASE}/api/logs/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to delete log file');

    showToast(`已删除 ${fileName}`, 'success');

    // 如果正在查看这个文件，关闭查看器
    if (logState.currentFile === fileName) {
      closeLogViewer();
    }

    // 刷新列表
    loadLogFiles();
  } catch (err) {
    console.error('Failed to delete log file:', err);
    showToast('删除日志失败', 'error');
  }
}

async function clearAllLogsUI() {
  const keepToday = confirm('是否保留今天的日志？\n\n点击"确定"保留今天的日志\n点击"取消"删除所有日志（包括今天）');

  const confirmMsg = keepToday
    ? '确定清理所有历史日志（保留今天）？'
    : '确定删除所有日志（包括今天）？此操作不可恢复！';

  if (!confirm(confirmMsg)) return;

  try {
    const response = await fetch(`${API_BASE}/api/logs/clear`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ keepToday })
    });

    if (!response.ok) throw new Error('Failed to clear logs');

    const data = await response.json();
    showToast(`已清理 ${data.deletedCount} 个日志文件`, 'success');

    closeLogViewer();
    loadLogFiles();
  } catch (err) {
    console.error('Failed to clear logs:', err);
    showToast('清理日志失败', 'error');
  }
}

function initLogViewer() {
  // 刷新按钮
  document.getElementById('refreshLogsBtn').addEventListener('click', loadLogFiles);

  // 清理按钮
  document.getElementById('clearLogsBtn').addEventListener('click', clearAllLogsUI);

  // 关闭查看器
  document.getElementById('closeLogViewer').addEventListener('click', closeLogViewer);

  // 加载更多
  document.getElementById('loadMoreLogs').addEventListener('click', loadMoreLogContent);
}

// 暴露到全局
window.viewLogFile = viewLogFile;
window.deleteLogFileUI = deleteLogFileUI;

// ==================== 认证管理 ====================
const authState = {
  token: localStorage.getItem('authToken') || '',
  isAuthenticated: false
};

// 获取带认证的请求头
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authState.token) {
    headers['Authorization'] = `Bearer ${authState.token}`;
  }
  return headers;
}

// 检查是否需要登录
async function checkAuthRequired() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/check`);
    const data = await response.json();
    return data.needsAuth;
  } catch (err) {
    console.error('Failed to check auth:', err);
    return false;
  }
}

// 验证当前 token 是否有效
async function validateToken() {
  if (!authState.token) return false;

  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      headers: getAuthHeaders()
    });
    return response.ok;
  } catch {
    return false;
  }
}

// 登录
async function login(token) {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (data.success) {
      authState.token = data.token || token;
      authState.isAuthenticated = true;
      localStorage.setItem('authToken', authState.token);
      return { success: true };
    }

    return { success: false, error: data.error || '登录失败' };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: '网络错误' };
  }
}

// 登出
function logout() {
  authState.token = '';
  authState.isAuthenticated = false;
  localStorage.removeItem('authToken');
  showLoginOverlay();
}

// 显示登录页面
function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

// 隐藏登录页面
function hideLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  // 显示登出按钮（仅当需要认证时）
  updateLogoutButtonVisibility();
}

// 更新登出按钮可见性
function updateLogoutButtonVisibility() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    // 如果设置了访问密钥，显示登出按钮
    const hasToken = !!state.settings.accessToken && state.settings.accessToken.trim() !== '';
    logoutBtn.style.display = hasToken ? 'flex' : 'none';
  }
}

// 初始化登录功能
function initLogin() {
  const loginBtn = document.getElementById('loginBtn');
  const loginTokenInput = document.getElementById('loginToken');
  const loginError = document.getElementById('loginError');
  const loginErrorText = document.getElementById('loginErrorText');
  const toggleLoginToken = document.getElementById('toggleLoginToken');
  const logoutBtn = document.getElementById('logoutBtn');

  // 登出按钮点击
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('确定要退出登录吗？')) {
        logout();
      }
    });
  }

  // 切换密码显示
  toggleLoginToken.addEventListener('click', () => {
    const isPassword = loginTokenInput.type === 'password';
    loginTokenInput.type = isPassword ? 'text' : 'password';
    toggleLoginToken.querySelector('.material-icons').textContent =
      isPassword ? 'visibility_off' : 'visibility';
  });

  // 登录按钮点击
  loginBtn.addEventListener('click', async () => {
    const token = loginTokenInput.value.trim();

    if (!token) {
      loginError.style.display = 'flex';
      loginErrorText.textContent = '请输入访问密钥';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading-spinner"></span> 登录中...';
    loginError.style.display = 'none';

    const result = await login(token);

    if (result.success) {
      hideLoginOverlay();
      showToast('登录成功', 'success');
      // 重新加载数据
      await loadDataFromServer();
    } else {
      loginError.style.display = 'flex';
      loginErrorText.textContent = result.error;
    }

    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span class="material-icons">login</span> 登录';
  });

  // 回车键登录
  loginTokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });
}

// 从服务器加载数据
async function loadDataFromServer() {
  try {
    // 加载 API Keys
    const keysRes = await fetch(`${API_BASE}/api/keys`, { headers: getAuthHeaders() });
    if (keysRes.ok) {
      const serverKeys = await keysRes.json();
      // 合并服务器数据与本地数据：保留本地完整密钥值，更新服务器返回的元数据
      // 服务器返回的密钥值是遮盖过的，不能直接覆盖本地完整值
      const mergedKeys = serverKeys.map(serverKey => {
        const localKey = state.apiKeys.find(k => k.id === serverKey.id);
        if (localKey && localKey.value && !localKey.value.includes('...')) {
          // 本地有完整密钥值，保留它，但更新其他元数据
          return {
            ...serverKey,
            value: localKey.value  // 保留本地完整密钥值
          };
        }
        // 本地没有这个密钥或本地也是遮盖的，使用服务器数据
        return serverKey;
      });

      // 关键修复：保留本地独有的密钥（服务器上不存在但本地有完整值的）
      // 这可能发生在网络错误导致服务器保存失败时
      const serverKeyIds = new Set(serverKeys.map(k => k.id));
      const localOnlyKeys = state.apiKeys.filter(localKey =>
        !serverKeyIds.has(localKey.id) &&
        localKey.value &&
        !localKey.value.includes('...')
      );

      state.apiKeys = [...mergedKeys, ...localOnlyKeys];
      renderApiKeys();
    }

    // 加载设置
    const settingsRes = await fetch(`${API_BASE}/api/settings`, { headers: getAuthHeaders() });
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      state.settings = { ...state.settings, ...settings };

      // 关键修复：同步服务器的 accessToken 到本地认证状态
      // 这确保了刷新页面后 authState.token 与服务器配置保持一致
      if (settings.accessToken && settings.accessToken !== authState.token) {
        authState.token = settings.accessToken;
        authState.isAuthenticated = true;
        localStorage.setItem('authToken', settings.accessToken);
      }

      updateSettingsUI();
      updateAccessTokenStatus();
    }

    // 加载模型尺寸
    const sizesRes = await fetch(`${API_BASE}/api/model-sizes`, { headers: getAuthHeaders() });
    if (sizesRes.ok) {
      const sizes = await sizesRes.json();
      state.modelSizes = sizes;
    }

    // 确保所有 provider 都有默认尺寸配置
    initModelSizes();
    // 重新渲染尺寸配置 UI
    renderSizeConfigs();
  } catch (err) {
    console.error('Failed to load data from server:', err);
  }
}

// 更新设置 UI
function updateSettingsUI() {
  document.getElementById('apiPort').value = state.settings.apiPort || 5854;
  document.getElementById('apiTimeout').value = state.settings.apiTimeout || 300000;
  document.getElementById('imageBedUrl').value = state.settings.imageBedUrl || '';
  document.getElementById('imageBedEndpoint').value = state.settings.imageBedEndpoint || '';
  document.getElementById('imageBedAuth').value = state.settings.imageBedAuth || '';
  document.getElementById('imageBedFolder').value = state.settings.imageBedFolder || '';
  document.getElementById('imageBedChannel').value = state.settings.imageBedChannel || '';
  document.getElementById('accessToken').value = state.settings.accessToken || '';
  document.getElementById('convertWebpToPng').checked = state.settings.convertWebpToPng !== false;
  document.getElementById('convertToBase64').checked = state.settings.convertToBase64 !== false;
}

// 更新访问密钥状态显示
function updateAccessTokenStatus() {
  const statusEl = document.getElementById('accessTokenStatus');
  const statusText = document.getElementById('accessTokenStatusText');
  const hasToken = !!state.settings.accessToken && state.settings.accessToken.trim() !== '';

  if (hasToken) {
    statusEl.className = 'access-token-status active';
    statusEl.querySelector('.material-icons').textContent = 'lock';
    statusText.textContent = '访问密钥已设置，需要登录验证';
  } else {
    statusEl.className = 'access-token-status inactive';
    statusEl.querySelector('.material-icons').textContent = 'lock_open';
    statusText.textContent = '未设置访问密钥，无需登录';
  }

  // 同时更新登出按钮可见性
  updateLogoutButtonVisibility();
}

// 应用初始化认证流程
async function initAuth() {
  const needsAuth = await checkAuthRequired();

  if (!needsAuth) {
    // 不需要认证，直接显示主界面
    hideLoginOverlay();
    await loadDataFromServer();
    return;
  }

  // 需要认证，检查是否有有效的 token
  if (authState.token) {
    const isValid = await validateToken();
    if (isValid) {
      authState.isAuthenticated = true;
      hideLoginOverlay();
      await loadDataFromServer();
      return;
    }
    // Token 无效，清除
    localStorage.removeItem('authToken');
    authState.token = '';
  }

  // 显示登录页面
  showLoginOverlay();
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initTheme();
  initNavigation();
  initAddKeyModal();
  renderModelConfig();
  initSettings();
  initLogViewer();
  initLogin();
  startBanTimer();

  // 初始化认证流程
  initAuth();

  console.log('ImgRouter 控制面板已加载');
});
