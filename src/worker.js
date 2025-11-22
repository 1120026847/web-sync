import { AwsClient } from 'aws4fetch';

// ==========================================
// 1. 前端页面代码 (HTML + CSS + JS)
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

    <div id="toast" class="fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm transition-opacity duration-300 opacity-0 pointer-events-none z-50">
        提示信息
    </div>

<script>
    const API_BASE = '/api'; 

    // === 工具函数：显示提示 ===
    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        toast.innerText = msg;
        toast.className = \`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm transition-opacity duration-300 z-50 \${type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'}\`;
        toast.classList.remove('opacity-0');
        setTimeout(() => toast.classList.add('opacity-0'), 3000);
    }

    // === 工具函数：格式化文件大小 ===
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

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
        showToast('文本已复制');
    }

    async function readTextClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            textarea.value = text;
            textarea.dispatchEvent(new Event('blur'));
        } catch (err) {
            showToast('需要 HTTPS 权限读取剪切板', 'error');
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
            } catch (e) { showToast('上传失败: ' + file.name, 'error'); }
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
            else showToast("剪切板无图片", 'error');
        } catch (err) { showToast("读取失败 (需要HTTPS)", 'error'); }
    }

    // ✨ 新增：格式转换辅助函数 (JPG -> PNG)
    // 浏览器剪切板通常只支持写入 PNG
    function convertBlobToPng(blob) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((pngBlob) => resolve(pngBlob), 'image/png');
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    // ✨ 修复：复制图片本体 (支持 JPG 自动转 PNG)
    async function copyImageBody(url) {
        showToast('正在获取图片数据...', 'info');
        try {
            const data = await fetch(url);
            let blob = await data.blob();
            
            // 如果是 JPEG，转换为 PNG，否则写入剪切板会报错
            if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
                blob = await convertBlobToPng(blob);
            }

            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            showToast('✅ 图片已复制到剪切板');
        } catch (err) {
            console.error(err);
            showToast('复制失败: 格式不支持或跨域限制', 'error');
        }
    }

    // ✨ 新增：强制下载文件 (解决跨域只能预览问题)
    async function downloadFile(url, filename) {
        showToast('正在开始下载...', 'info');
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 释放内存
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            showToast('✅ 下载已开始');
        } catch(e) {
            // 兜底方案
            window.open(url, '_blank');
        }
    }

    async function refreshFiles() {
        fileListEl.innerHTML = '';
        loadingEl.classList.remove('hidden');
        try {
            const res = await fetch(API_BASE + '/files');
            const files = await res.json();
            loadingEl.classList.add('hidden');
            files.forEach(file => {
                const sizeStr = formatFileSize(file.size);
                const displayName = file.key.replace('uploads/', '').split('_').slice(1).join('_');
                const isImg = /\\.(jpg|jpeg|png|gif|webp)$/i.test(displayName);
                
                // 构建逻辑：图片复制本体，文件复制链接
                const copyAction = isImg 
                    ? \`copyImageBody('\${file.url}')\` 
                    : \`copyFileLink('\${file.url}')\`;
                
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
                        <button onclick="downloadFile('\${file.url}', '\${displayName}')" class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">⬇️</button>
                        <button onclick="\${copyAction}" class="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded">🔗</button>
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
        navigator.clipboard.writeText(url).then(() => showToast('链接已复制'));
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const client = new AwsClient({
      accessKeyId: env.COS_SECRET_ID,
      secretAccessKey: env.COS_SECRET_KEY,
      region: env.COS_REGION,
      service: 's3',
    });
    
    const bucketUrl = `https://${env.COS_BUCKET_NAME}.cos.${env.COS_REGION}.myqcloud.com`;

    if (url.pathname === '/') {
        return new Response(htmlContent, {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // API: 文本同步
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

    // API: 文件列表
    if (url.pathname === '/api/files' && request.method === 'GET') {
      const res = await client.fetch(`${bucketUrl}?list-type=2&prefix=uploads/`);
      const xml = await res.text();
      const files = [];
      const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      
      const matches = [];
      let match;
      while ((match = contentsRegex.exec(xml)) !== null) {
          matches.push(match[1]);
      }

      for (const content of matches) {
        const key = /<Key>(.*?)<\/Key>/.exec(content)[1];
        const size = /<Size>(.*?)<\/Size>/.exec(content)[1];
        const date = /<LastModified>(.*?)<\/LastModified>/.exec(content)[1];
        
        if(!key.endsWith('/')) {
            // 兜底逻辑：如果环境变量未设置，回退到硬编码域名
            const downloadBase = env.APP_HOST || 'https://dl.molijun.com';
            
            const fullUrl = `${downloadBase}/${key}`;
            
            const signed = await client.sign(fullUrl, {
                method: 'GET',
                aws: { signQuery: true }
            });

            files.push({ key, size, date, url: signed.url });
        }
      }
      
      files.sort((a, b) => new Date(b.date) - new Date(a.date));
      return new Response(JSON.stringify(files), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // API: 预签名上传
    if (url.pathname === '/api/sign-upload' && request.method === 'POST') {
      const { filename, type } = await request.json();
      const key = `uploads/${Date.now()}_${filename}`;
      
      const signed = await client.sign(`${bucketUrl}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': type || 'application/octet-stream' },
        aws: { signQuery: true }
      });
      
      return new Response(JSON.stringify({ url: signed.url, key: key }), { headers: corsHeaders });
    }

    // API: 删除文件
    if (url.pathname === '/api/delete' && request.method === 'POST') {
        const { key } = await request.json();
        await client.fetch(`${bucketUrl}/${key}`, { method: 'DELETE' });
        return new Response('Deleted', { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404 });
  },
};
