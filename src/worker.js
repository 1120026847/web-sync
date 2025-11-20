import { AwsClient } from 'aws4fetch';

// ==========================================
// 1. 前端页面代码 (HTML + CSS + JS)
// ==========================================
const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Cloud Sync - 极简传输</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        /* 移动端优化 */
        body { -webkit-tap-highlight-color: transparent; }
        .drag-over { border-color: #3b82f6 !important; background-color: #eff6ff; }
        .loader { border-top-color: #3498db; -webkit-animation: spinner 1.5s linear infinite; animation: spinner 1.5s linear infinite; }
        @keyframes spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* === Toast 消息组件样式 (无感提醒) === */
        #toast-container {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            z-index: 9999; pointer-events: none;
            display: flex; flex-direction: column; gap: 10px; width: 90%; max-width: 400px;
        }
        .toast {
            background: rgba(0, 0, 0, 0.8); color: white; padding: 12px 20px;
            border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity 0.3s, transform 0.3s;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); pointer-events: auto;
            display: flex; align-items: center; transform: translateY(-20px);
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast-success { border-left: 4px solid #4ade80; }
        .toast-error { border-left: 4px solid #f87171; }
        .toast-info { border-left: 4px solid #60a5fa; }

        /* 粘贴专用区域样式 */
        #pasteTarget {
            font-size: 14px; color: #6b7280; background: #f9fafb;
            border: 1px dashed #d1d5db; border-radius: 6px;
            padding: 12px; margin-top: 10px; outline: none;
            min-height: 44px; display: flex; align-items: center; justify-content: center;
        }
        #pasteTarget:focus { border-color: #3b82f6; background: #eff6ff; color: #3b82f6; }
        #pasteTarget::before { content: "📱 手机端点此 -> 长按粘贴 -> 上传图片"; }
        #pasteTarget:not(:empty)::before { content: none; }
    </style>
</head>
<body class="bg-gray-50 text-gray-700 h-screen flex flex-col md:flex-row overflow-hidden">

    <div id="toast-container"></div>

    <div class="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col border-r border-gray-200 bg-white">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">📝 文本同步</h2>
            <div class="space-x-2">
                <button onclick="readTextClipboard()" class="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded active:bg-gray-300">读取剪切板</button>
                <button onclick="copyText()" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded active:bg-blue-200">复制全文</button>
                <span id="saveStatus" class="text-xs text-green-500 hidden">已保存</span>
            </div>
        </div>
        <textarea id="notepad" class="w-full flex-1 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-base font-mono" placeholder="在这里输入文本，失去焦点自动保存..."></textarea>
    </div>

    <div class="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col bg-gray-50">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">📂 文件传输</h2>
            <div class="space-x-2 flex">
                 <button onclick="refreshFiles()" class="text-xs bg-white border hover:bg-gray-50 px-3 py-2 rounded shadow-sm whitespace-nowrap active:bg-gray-100">🔄 刷新</button>
                 <button onclick="document.getElementById('fileInput').click()" class="text-xs bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded shadow-sm whitespace-nowrap active:bg-blue-800">
                    📤 选择文件
                 </button>
            </div>
        </div>

        <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center transition hover:border-blue-400 mb-4 relative flex flex-col justify-center">
            <p class="text-gray-500 pointer-events-none text-sm hidden md:block">
                电脑端：拖拽文件 或 Ctrl+V 粘贴
            </p>
            
            <div id="pasteTarget" contenteditable="true"></div>
            
            <input type="file" id="fileInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer hidden">
        </div>

        <div class="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
            <ul id="fileList" class="divide-y divide-gray-100"></ul>
            <div id="loading" class="hidden p-4 flex justify-center"><div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-6 w-6"></div></div>
        </div>
    </div>

    <div id="previewModal" class="fixed inset-0 bg-black bg-opacity-80 hidden flex items-center justify-center z-50" onclick="closePreview()">
        <div class="bg-transparent p-2 rounded max-w-full max-h-full overflow-auto relative" onclick="event.stopPropagation()">
             <img id="previewImage" src="" class="max-w-full max-h-[90vh] block rounded shadow-lg">
             <div id="previewUnknown" class="p-10 hidden text-center text-white">无法预览此文件类型</div>
             <button onclick="closePreview()" class="absolute -top-10 right-0 text-white text-xl p-2">✕ 关闭</button>
        </div>
    </div>

<script>
    const API_BASE = '/api'; 
    const notepad = document.getElementById('notepad');
    const saveStatus = document.getElementById('saveStatus');

    // === 0. Toast 消息工具 ===
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = \`toast \${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : 'toast-info')}\`;
        toast.innerText = message;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

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
        notepad.select(); 
        try {
            document.execCommand('copy'); 
            showToast('✅ 文本已复制');
        } catch(e) { showToast('复制失败', 'error'); }
    }

    async function readTextClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            notepad.value = text;
            notepad.dispatchEvent(new Event('blur'));
            showToast('已读取剪切板文本');
        } catch (err) { showToast('读取失败，请手动粘贴', 'error'); }
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
                li.className = 'p-3 hover:bg-gray-50 flex items-center justify-between group transition border-b border-gray-50';
                li.innerHTML = \`
                    <div class="flex items-center overflow-hidden flex-1 mr-2">
                        <div class="mr-3 text-2xl">\${isImg ? '🖼️' : '📄'}</div>
                        <div class="overflow-hidden">
                            <div class="font-medium text-sm truncate cursor-pointer text-gray-700 hover:text-blue-600" 
                                 onclick="preview('\${file.url}', \${isImg})">\${displayName}</div>
                            <div class="text-xs text-gray-400">\${sizeStr} • \${new Date(file.date).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <a href="\${file.url}" download="\${displayName}" class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center">下载</a>
                        <button onclick="copyFileContent('\${file.url}', \${isImg}, '\${displayName}')" class="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center">
                            \${isImg ? '复制' : '链接'}
                        </button>
                        <button onclick="deleteFile('\${file.key}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center">删除</button>
                    </div>\`;
                fileListEl.appendChild(li);
            });
        } catch(e) { loadingEl.classList.add('hidden'); console.error(e); }
    }

    // === 3. 修复后的复制逻辑 ===
    async function copyFileContent(url, isImg, filename) {
        // 移动端优先尝试系统分享
        if (isImg && navigator.canShare && navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
            try {
                showToast('正在调起系统分享...', 'info');
                const response = await fetch(url);
                const blob = await response.blob();
                const file = new File([blob], filename, { type: blob.type });
                await navigator.share({ files: [file], title: filename });
                return; 
            } catch (err) { console.log('Share failed', err); }
        }

        // PC端或分享失败，尝试写入剪切板
        if (isImg) {
            try {
                showToast('正在下载图片...', 'info');
                const response = await fetch(url);
                const blob = await response.blob();
                
                // 关键修复：ClipboardItem 必须要具体的 MIME type，且很多浏览器只支持 image/png
                // 如果是 JPG，尝试直接写入，如果报错则捕获
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
                showToast('✅ 图片已复制，可直接粘贴');
            } catch (err) {
                console.error(err);
                // 降级处理：如果写图片失败（比如格式不支持），则复制链接
                navigator.clipboard.writeText(url).then(() => showToast('⚠️ 格式不支持直接复制，已复制链接', 'info'));
            }
        } else {
            navigator.clipboard.writeText(url).then(() => showToast('🔗 文件链接已复制'));
        }
    }

    async function deleteFile(key) {
        if(!confirm('确定删除文件?')) return;
        await fetch(API_BASE + '/delete', { method: 'POST', body: JSON.stringify({ key }) });
        refreshFiles();
        showToast('文件已删除');
    }

    // === 4. 上传逻辑 (含安卓长按粘贴修复) ===
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const pasteTarget = document.getElementById('pasteTarget');

    // 拖拽上传
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    // 文件选择上传
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // 全局粘贴 (PC端快捷键)
    document.addEventListener('paste', (e) => {
        if (e.target === pasteTarget || e.target === notepad) return; // 如果在输入框内粘贴，交给输入框处理
        handlePasteEvent(e);
    });

    // 核心修复：安卓端专用粘贴区域监听
    pasteTarget.addEventListener('paste', (e) => {
        e.preventDefault(); // 阻止默认粘贴（防止图片显示在框里）
        handlePasteEvent(e);
        pasteTarget.innerHTML = ''; // 清空提示文字
        setTimeout(() => pasteTarget.blur(), 100); // 失去焦点，收起键盘
    });
    
    // 处理粘贴事件的通用函数
    function handlePasteEvent(e) {
        const items = e.clipboardData.items;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') files.push(items[i].getAsFile());
        }
        if (files.length > 0) {
            handleFiles(files);
        } else {
            // 如果粘贴的是纯文本链接，可以在这里处理，或者忽略
            showToast('未检测到图片文件', 'info');
        }
    }

    async function handleFiles(files) {
        if (!files.length) return;
        showToast(\`开始上传 \${files.length} 个文件...\`, 'info');
        
        for (let file of files) {
            try {
                const signRes = await fetch(API_BASE + '/sign-upload', {
                    method: 'POST',
                    body: JSON.stringify({ filename: file.name, type: file.type })
                });
                const { url } = await signRes.json();
                await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                showToast(\`✅ \${file.name} 上传成功\`);
            } catch (e) { showToast(\`❌ \${file.name} 上传失败\`, 'error'); }
        }
        refreshFiles();
    }

    // === 5. 预览 ===
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
// 2. 后端业务逻辑 (Worker) - 保持不变
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

    if (url.pathname === '/api/files' && request.method === 'GET') {
      const res = await client.fetch(`${bucketUrl}?list-type=2&prefix=uploads/`);
      const xml = await res.text();
      const files = [];
      const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match;
      while ((match = contentsRegex.exec(xml)) !== null) {
        const content = match[1];
        const key = /<Key>(.*?)<\/Key>/.exec(content)[1];
        const size = /<Size>(.*?)<\/Size>/.exec(content)[1];
        const date = /<LastModified>(.*?)<\/LastModified>/.exec(content)[1];
        if(!key.endsWith('/')) {
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

    if (url.pathname === '/api/delete' && request.method === 'POST') {
        const { key } = await request.json();
        await client.fetch(`${bucketUrl}/${key}`, { method: 'DELETE' });
        return new Response('Deleted', { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404 });
  },
};
