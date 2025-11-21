import { AwsClient } from 'aws4fetch';

// ==========================================
// 1. 前端页面代码 (HTML + CSS + JS)
// 保持不变
// ==========================================
const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloud Sync - 多端同步</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .drag-over { border-color: #3b82f6 !important; background-color: #eff6ff; }
        .loader { border-top-color: #3498db; -webkit-animation: spinner 1.5s linear infinite; animation: spinner 1.5s linear infinite; }
        @keyframes spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body class="bg-gray-50 text-gray-700 h-screen flex flex-col md:flex-row overflow-hidden">

    <div class="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col border-r border-gray-200 bg-white">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">📝 文本同步</h2>
            <div class="space-x-2">
                <button onclick="readTextClipboard()" class="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">读取剪切板</button>
                <button onclick="copyText()" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded">复制全文</button>
                <span id="saveStatus" class="text-xs text-green-500 hidden">已保存</span>
            </div>
        </div>
        <textarea id="notepad" class="w-full flex-1 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-base font-mono" placeholder="在这里输入文本，失去焦点自动保存..."></textarea>
    </div>

    <div class="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col bg-gray-50">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">📂 文件传输</h2>
            <div class="space-x-2">
                 <button onclick="refreshFiles()" class="text-xs bg-white border hover:bg-gray-50 px-3 py-1 rounded shadow-sm">🔄 刷新</button>
                 <button onclick="uploadFromClipboard()" class="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded">上传剪切板图片</button>
            </div>
        </div>

        <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer transition hover:border-blue-400 mb-4 relative">
            <p class="text-gray-500 pointer-events-none">拖拽文件、粘贴(Ctrl+V) 或 <span class="text-blue-500">点击上传</span></p>
            <input type="file" id="fileInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        </div>

        <div class="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
            <ul id="fileList" class="divide-y divide-gray-100"></ul>
            <div id="loading" class="hidden p-4 flex justify-center"><div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-6 w-6"></div></div>
        </div>
    </div>

    <div id="previewModal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50" onclick="closePreview()">
        <div class="bg-white p-2 rounded max-w-3xl max-h-[90vh] overflow-auto relative">
             <img id="previewImage" src="" class="max-w-full h-auto block">
             <div id="previewUnknown" class="p-10 hidden text-center">无法预览此文件类型</div>
        </div>
    </div>

<script>
    // 配置 API 路径 (当前域名下)
    const API_BASE = '/api'; 

    // === 文本逻辑 ===
    const textarea = document.getElementById('notepad');
    const saveStatus = document.getElementById('saveStatus');

    async function loadText() {
        try {
            const res = await fetch(API_BASE + '/text');
            if(res.ok) textarea.value = await res.text();
        } catch(e) { console.error(e); }
    }

    textarea.addEventListener('blur', async () => {
        saveStatus.innerText = '保存中...';
        saveStatus.classList.remove('hidden');
        try {
            await fetch(API_BASE + '/text', { method: 'POST', body: textarea.value });
            saveStatus.innerText = '已保存';
            setTimeout(() => saveStatus.classList.add('hidden'), 2000);
        } catch(e) {
            saveStatus.innerText = '保存失败';
            saveStatus.classList.add('text-red-500');
        }
    });

    function copyText() {
        textarea.select();
        document.execCommand('copy');
        alert('文本已复制');
    }

    async function readTextClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            textarea.value = text;
            textarea.dispatchEvent(new Event('blur'));
        } catch (err) {
            alert('需要 HTTPS 权限读取剪切板');
        }
    }

    // === 文件逻辑 ===
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileListEl = document.getElementById('fileList');
    const loadingEl = document.getElementById('loading');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') files.push(items[i].getAsFile());
        }
        if (files.length > 0) handleFiles(files);
    });

    async function handleFiles(files) {
        if (!files.length) return;
        dropZone.innerHTML = '<p class="text-blue-500">正在上传...</p>';
        for (let file of files) {
            try {
                const signRes = await fetch(API_BASE + '/sign-upload', {
                    method: 'POST',
                    body: JSON.stringify({ filename: file.name, type: file.type })
                });
                const { url } = await signRes.json();
                await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
            } catch (e) { alert('上传失败: ' + file.name); }
        }
        dropZone.innerHTML = '<p class="text-gray-500 pointer-events-none">拖拽文件、粘贴(Ctrl+V) 或 <span class="text-blue-500">点击上传</span></p><input type="file" id="fileInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">';
        refreshFiles();
    }
    
    async function uploadFromClipboard() {
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        files.push(new File([blob], 'clipboard_' + Date.now() + '.png', { type }));
                    }
                }
            }
            if (files.length > 0) handleFiles(files);
            else alert("剪切板无图片");
        } catch (err) { alert("读取失败 (需要HTTPS)"); }
    }

    async function refreshFiles() {
        fileListEl.innerHTML = '';
        loadingEl.classList.remove('hidden');
        try {
            const res = await fetch(API_BASE + '/files');
            const files = await res.json();
            loadingEl.classList.add('hidden');
            files.forEach(file => {
                const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
                const displayName = file.key.replace('uploads/', '').split('_').slice(1).join('_');
                const isImg = /\\.(jpg|jpeg|png|gif|webp)$/i.test(displayName);
                const li = document.createElement('li');
                li.className = 'p-3 hover:bg-gray-50 flex items-center justify-between group';
                li.innerHTML = \`
                    <div class="flex items-center overflow-hidden">
                        <div class="mr-3 text-2xl">\${isImg ? '🖼️' : '📄'}</div>
                        <div class="overflow-hidden">
                            <div class="font-medium text-sm truncate cursor-pointer text-gray-700 hover:text-blue-600" 
                                 onclick="preview('\${file.url}', \${isImg})">\${displayName}</div>
                            <div class="text-xs text-gray-400">\${sizeStr} • \${new Date(file.date).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="flex space-x-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <a href="\${file.url}" download class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">⬇️</a>
                        <button onclick="copyFileLink('\${file.url}')" class="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded">🔗</button>
                        <button onclick="deleteFile('\${file.key}')" class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">🗑️</button>
                    </div>\`;
                fileListEl.appendChild(li);
            });
        } catch(e) { loadingEl.classList.add('hidden'); }
    }

    async function deleteFile(key) {
        if(!confirm('确定删除?')) return;
        await fetch(API_BASE + '/delete', { method: 'POST', body: JSON.stringify({ key }) });
        refreshFiles();
    }

    function copyFileLink(url) {
        navigator.clipboard.writeText(url).then(() => alert('链接已复制'));
    }

    window.preview = (url, isImg) => {
        const modal = document.getElementById('previewModal');
        if(isImg) {
            document.getElementById('previewImage').src = url;
            document.getElementById('previewImage').classList.remove('hidden');
            document.getElementById('previewUnknown').classList.add('hidden');
        } else {
            document.getElementById('previewImage').classList.add('hidden');
            document.getElementById('previewUnknown').classList.remove('hidden');
        }
        modal.classList.remove('hidden');
    }
    window.closePreview = () => document.getElementById('previewModal').classList.add('hidden');

    loadText();
    refreshFiles();
</script>
</body>
</html>
`;

// ==========================================
// 2. 后端业务逻辑 (Worker)
// ==========================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 初始化腾讯云 COS 客户端
    const client = new AwsClient({
      accessKeyId: env.COS_SECRET_ID,
      secretAccessKey: env.COS_SECRET_KEY,
      region: env.COS_REGION,
      service: 's3',
    });
    
    // 注意：这个 bucketUrl 用于 Worker 内部和 COS 通信（列出文件、删除文件），
    // 必须保持为腾讯云的默认域名，不能改。
    const bucketUrl = `https://${env.COS_BUCKET_NAME}.cos.${env.COS_REGION}.myqcloud.com`;

    // ==========================
    // 路由匹配逻辑
    // ==========================

    // 1. 首页：返回 HTML 界面
    if (url.pathname === '/') {
        return new Response(htmlContent, {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // 2. API: 获取/更新 文本信息
    if (url.pathname === '/api/text') {
      const textKey = 'sync_data/notepad.txt';
      if (request.method === 'GET') {
        const res = await client.fetch(`${bucketUrl}/${textKey}`);
        if (res.status === 404) return new Response("", { headers: corsHeaders });
        const text = await res.text();
        return new Response(text, { headers: corsHeaders });
      } else if (request.method === 'POST') {
        const text = await request.text();
        await client.fetch(`${bucketUrl}/${textKey}`, { method: 'PUT', body: text });
        return new Response('Saved', { headers: corsHeaders });
      }
    }

    // 3. API: 获取文件列表 (【已修改】：支持私有桶下载)
    if (url.pathname === '/api/files' && request.method === 'GET') {
      const res = await client.fetch(`${bucketUrl}?list-type=2&prefix=uploads/`);
      const xml = await res.text();
      const files = [];
      const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      
      // 先收集所有匹配项，避免在 while 循环中处理异步 await
      const matches = [];
      let match;
      while ((match = contentsRegex.exec(xml)) !== null) {
          matches.push(match[1]);
      }

      // 遍历解析并生成签名
      for (const content of matches) {
        const key = /<Key>(.*?)<\/Key>/.exec(content)[1];
        const size = /<Size>(.*?)<\/Size>/.exec(content)[1];
        const date = /<LastModified>(.*?)<\/LastModified>/.exec(content)[1];
        
        if(!key.endsWith('/')) {
            const downloadBase = env.APP_HOST;
            
            // =========================================================
            // 安全升级：生成带签名的 URL (Presigned URL)
            // 这样即使桶是私有的，前端也能凭借这个带签名的链接下载
            // =========================================================
            const fullUrl = `${downloadBase}/${key}`;
            
            const signed = await client.sign(fullUrl, {
                method: 'GET',
                aws: { signQuery: true } // 这会在 URL 后追加 ?X-Amz-Signature=...
            });

            // 将签名后的 URL 放入列表
            files.push({ key, size, date, url: signed.url });
        }
      }
      
      files.sort((a, b) => new Date(b.date) - new Date(a.date));
      return new Response(JSON.stringify(files), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. API: 获取上传预签名 URL
    if (url.pathname === '/api/sign-upload' && request.method === 'POST') {
      const { filename, type } = await request.json();
      // 使用时间戳防止文件名冲突
      const key = `uploads/${Date.now()}_${filename}`;
      
      const signed = await client.sign(`${bucketUrl}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': type || 'application/octet-stream' },
        aws: { signQuery: true }
      });
      
      return new Response(JSON.stringify({ url: signed.url, key: key }), { headers: corsHeaders });
    }

    // 5. API: 删除文件
    if (url.pathname === '/api/delete' && request.method === 'POST') {
        const { key } = await request.json();
        await client.fetch(`${bucketUrl}/${key}`, { method: 'DELETE' });
        return new Response('Deleted', { headers: corsHeaders });
    }

    // 404 处理
    return new Response("Not Found", { status: 404 });
  },
};
