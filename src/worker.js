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
    <title>Cloud Sync - 安全传输</title>
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
            <h2 class="text-xl font-bold text-gray-800">📂 文件传输 <span class="text-xs font-normal text-gray-400">(私有加密)</span></h2>
            <div class="space-x-2">
                 <button onclick="refreshFiles()" class="text-xs bg-white border hover:bg-gray-50 px-3 py-1 rounded shadow-sm">🔄 刷新列表</button>
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
        <div class="bg-white p-2 rounded max-w-3xl max-h-[90vh] overflow-auto relative" onclick="event.stopPropagation()">
             <img id="previewImage" src="" class="max-w-full h-auto block rounded">
             <div id="previewUnknown" class="p-10 hidden text-center">无法预览此文件类型</div>
             <button onclick="closePreview()" class="absolute top-2 right-2 bg-gray-200 hover:bg-gray-300 rounded-full p-1 w-8 h-8">✕</button>
        </div>
    </div>

<script>
    const API_BASE = '/api'; 
    const notepad = document.getElementById('notepad');
    const saveStatus = document.getElementById('saveStatus');

    // === 1. 文本逻辑 ===
    async function loadText() {
        try {
            const res = await fetch(API_BASE + '/text');
            if(res.ok) notepad.value = await res.text();
        } catch(e) { console.error(e); }
    }

    notepad.addEventListener('blur', async () => {
        saveStatus.innerText = '保存中...';
        saveStatus.classList.remove('hidden');
        try {
            await fetch(API_BASE + '/text', { method: 'POST', body: notepad.value });
            saveStatus.innerText = '已保存';
            setTimeout(() => saveStatus.classList.add('hidden'), 2000);
        } catch(e) {
            saveStatus.innerText = '保存失败'; saveStatus.classList.add('text-red-500');
        }
    });

    function copyText() {
        notepad.select(); document.execCommand('copy'); alert('文本已复制');
    }

    async function readTextClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            notepad.value = text;
            notepad.dispatchEvent(new Event('blur'));
        } catch (err) { alert('无法读取剪切板 (需要HTTPS)'); }
    }

    // === 2. 文件列表与操作 ===
    const fileListEl = document.getElementById('fileList');
    const loadingEl = document.getElementById('loading');

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
                li.className = 'p-3 hover:bg-gray-50 flex items-center justify-between group transition';
                li.innerHTML = \`
                    <div class="flex items-center overflow-hidden flex-1 mr-4">
                        <div class="mr-3 text-2xl">\${isImg ? '🖼️' : '📄'}</div>
                        <div class="overflow-hidden">
                            <div class="font-medium text-sm truncate cursor-pointer text-gray-700 hover:text-blue-600" 
                                 onclick="preview('\${file.url}', \${isImg})">\${displayName}</div>
                            <div class="text-xs text-gray-400">\${sizeStr} • \${new Date(file.date).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="flex space-x-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <a href="\${file.url}" download="\${displayName}" class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">下载</a>
                        <button onclick="copyFileContent('\${file.url}', \${isImg})" class="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">
                            \${isImg ? '复制图片' : '复制链接'}
                        </button>
                        <button onclick="deleteFile('\${file.key}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
                    </div>\`;
                fileListEl.appendChild(li);
            });
        } catch(e) { loadingEl.classList.add('hidden'); console.error(e); }
    }

    // 核心：复制本体逻辑
    async function copyFileContent(url, isImg) {
        if (isImg) {
            try {
                // 1. 获取图片数据 Blob
                const response = await fetch(url);
                const blob = await response.blob();
                // 2. 写入剪切板
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
                alert('✅ 图片本体已复制！可在微信/文档中直接粘贴');
            } catch (err) {
                console.error(err);
                alert('复制图片失败，可能是浏览器不支持或跨域问题');
            }
        } else {
            // 非图片文件只能复制链接
            navigator.clipboard.writeText(url).then(() => alert('🔗 文件下载链接已复制'));
        }
    }

    async function deleteFile(key) {
        if(!confirm('确定删除文件?')) return;
        await fetch(API_BASE + '/delete', { method: 'POST', body: JSON.stringify({ key }) });
        refreshFiles();
    }

    // === 3. 上传逻辑 ===
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

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
        dropZone.innerHTML = '<p class="text-blue-500">正在加密上传...</p>';
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

    // === 4. 预览 ===
    window.preview = (url, isImg) => {
        const modal = document.getElementById('previewModal');
        const img = document.getElementById('previewImage');
        const unknown = document.getElementById('previewUnknown');
        modal.classList.remove('hidden');
        if(isImg) {
            img.src = url; img.classList.remove('hidden'); unknown.classList.add('hidden');
        } else {
            img.classList.add('hidden'); unknown.classList.remove('hidden');
        }
    }
    window.closePreview = () => {
        document.getElementById('previewModal').classList.add('hidden');
        document.getElementById('previewImage').src = '';
    }

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

    // 1. 首页
    if (url.pathname === '/') {
        return new Response(htmlContent, {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // 2. 文本同步
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

    // 3. 获取文件列表 (核心修改：生成带签名的下载链接)
    if (url.pathname === '/api/files' && request.method === 'GET') {
      const res = await client.fetch(`${bucketUrl}?list-type=2&prefix=uploads/`);
      const xml = await res.text();
      const files = [];
      const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match;
      
      // 解析 XML
      while ((match = contentsRegex.exec(xml)) !== null) {
        const content = match[1];
        const key = /<Key>(.*?)<\/Key>/.exec(content)[1];
        const size = /<Size>(.*?)<\/Size>/.exec(content)[1];
        const date = /<LastModified>(.*?)<\/LastModified>/.exec(content)[1];
        
        if(!key.endsWith('/')) {
            // === 关键变化：生成带签名的 GET URL ===
            // 有效期 3600秒 (1小时)
            const signedUrl = await client.sign(`${bucketUrl}/${key}`, {
                method: 'GET',
                aws: { signQuery: true }
            });
            
            files.push({ key, size, date, url: signedUrl.url });
        }
      }
      
      files.sort((a, b) => new Date(b.date) - new Date(a.date));
      return new Response(JSON.stringify(files), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. 获取上传签名 (PUT)
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

    // 5. 删除文件
    if (url.pathname === '/api/delete' && request.method === 'POST') {
        const { key } = await request.json();
        await client.fetch(`${bucketUrl}/${key}`, { method: 'DELETE' });
        return new Response('Deleted', { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404 });
  },
};
