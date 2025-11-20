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
        body { -webkit-tap-highlight-color: transparent; }
        .loader { border-top-color: #3498db; -webkit-animation: spinner 1.5s linear infinite; animation: spinner 1.5s linear infinite; }
        @keyframes spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* 粘贴区域样式 - 移动端更紧凑 */
        #pasteTarget {
            font-size: 13px; color: #6b7280; background: #f9fafb;
            border: 1px dashed #d1d5db; border-radius: 6px;
            padding: 8px; margin-top: 8px; outline: none;
            min-height: 36px; display: flex; align-items: center; justify-content: center;
        }
        #pasteTarget:focus { border-color: #3b82f6; background: #eff6ff; color: #3b82f6; }
        #pasteTarget::before { content: "📱 手机点此 -> 长按粘贴 -> 上传图片"; }
        #pasteTarget:not(:empty)::before { content: none; }
    </style>
</head>
<body class="bg-gray-50 text-gray-700 h-screen flex flex-col md:flex-row overflow-hidden">

    <div class="w-full md:w-1/2 h-[35vh] md:h-full flex-none flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white p-3 md:p-4">
        <div class="flex justify-between items-center mb-2 md:mb-4">
            <h2 class="text-lg md:text-xl font-bold text-gray-800">📝 文本同步</h2>
            <div class="space-x-2">
                <button onclick="readTextClipboard()" class="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded active:bg-gray-300">读取剪切板</button>
                <button onclick="copyText()" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1.5 rounded active:bg-blue-200">复制全文</button>
            </div>
        </div>
        <textarea id="notepad" class="w-full flex-1 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm md:text-base font-mono" placeholder="在这里输入文本，自动保存..."></textarea>
    </div>

    <div class="w-full md:w-1/2 flex-1 md:h-full flex flex-col bg-gray-50 p-3 md:p-4 min-h-0">
        <div class="flex justify-between items-center mb-2 md:mb-4 flex-none">
            <h2 class="text-lg md:text-xl font-bold text-gray-800">📂 文件传输</h2>
            
            <div class="flex items-center">
                 <span id="globalMsg" class="text-xs md:text-sm mr-2 font-medium transition-opacity duration-500 opacity-0 text-green-500 truncate max-w-[120px] md:max-w-none"></span>
                 
                 <div class="space-x-2 flex">
                     <button onclick="refreshAll()" class="text-xs bg-white border hover:bg-gray-50 px-2 py-1.5 rounded shadow-sm whitespace-nowrap active:bg-gray-100">🔄 全局刷新</button>
                     <button onclick="document.getElementById('fileInput').click()" class="text-xs bg-blue-600 text-white hover:bg-blue-700 px-2 py-1.5 rounded shadow-sm whitespace-nowrap active:bg-blue-800">
                        📤 选择文件
                     </button>
                 </div>
            </div>
        </div>

        <div id="dropZone" class="flex-none border-2 border-dashed border-gray-300 rounded-lg p-2 md:p-4 text-center transition hover:border-blue-400 mb-3 relative flex flex-col justify-center">
            <p class="text-gray-500 pointer-events-none text-sm hidden md:block">
                电脑端：拖拽文件 或 Ctrl+V 粘贴
            </p>
            <div id="pasteTarget" contenteditable="true"></div>
            <input type="file" id="fileInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer hidden">
        </div>

        <div class="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100 min-h-0">
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
    let msgTimeout;

    function showStatus(message, type) {
        const el = document.getElementById('globalMsg');
        if (!el) return;
        
        let colorClass = 'text-green-500';
        if (type === 'error') colorClass = 'text-red-500';
        if (type === 'info') colorClass = 'text-blue-500';
        
        el.className = 'text-xs md:text-sm mr-2 font-medium transition-opacity duration-500 opacity-100 truncate max-w-[120px] md:max-w-none ' + colorClass;
        el.innerText = message;
        
        if (msgTimeout) clearTimeout(msgTimeout);
        msgTimeout = setTimeout(function() {
            el.classList.remove('opacity-100');
            el.classList.add('opacity-0');
        }, 3000);
    }

    async function loadText() {
        try {
            const res = await fetch(API_BASE + '/text');
            if(res.ok) notepad.value = await res.text();
        } catch(e) { console.error(e); }
    }

    notepad.addEventListener('blur', async function() {
        showStatus('正在保存...', 'info');
        try {
            await fetch(API_BASE + '/text', { method: 'POST', body: notepad.value });
            showStatus('文本已保存 ^_^');
        } catch(e) { showStatus('保存失败', 'error'); }
    });

    function copyText() {
        notepad.select(); 
        try {
            document.execCommand('copy'); 
            showStatus('文本已复制');
        } catch(e) { showStatus('复制失败', 'error'); }
    }

    async function readTextClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            notepad.value = text;
            notepad.dispatchEvent(new Event('blur'));
            showStatus('已读取剪切板');
        } catch (err) { showStatus('读取失败，请手动粘贴', 'error'); }
    }

    const fileListEl = document.getElementById('fileList');
    const loadingEl = document.getElementById('loading');

    async function refreshAll() {
        loadText();
        fileListEl.innerHTML = '';
        loadingEl.classList.remove('hidden');
        try {
            const res = await fetch(API_BASE + '/files');
            const files = await res.json();
            loadingEl.classList.add('hidden');
            
            files.forEach(function(file) {
                const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
                const displayName = file.key.replace('uploads/', '').split('_').slice(1).join('_');
                const isImg = /\\.(jpg|jpeg|png|gif|webp)$/i.test(displayName);
                
                const li = document.createElement('li');
                li.className = 'p-3 hover:bg-gray-50 flex items-center justify-between group transition border-b border-gray-50';

                const leftDiv = document.createElement('div');
                leftDiv.className = 'flex items-center overflow-hidden flex-1 mr-2';
                
                const iconDiv = document.createElement('div');
                iconDiv.className = 'mr-3 text-2xl';
                iconDiv.textContent = isImg ? '🖼️' : '📄';
                leftDiv.appendChild(iconDiv);
                
                const infoDiv = document.createElement('div');
                infoDiv.className = 'overflow-hidden';
                
                const nameDiv = document.createElement('div');
                nameDiv.className = 'font-medium text-sm truncate cursor-pointer text-gray-700 hover:text-blue-600';
                nameDiv.textContent = displayName;
                nameDiv.onclick = function() { preview(file.url, isImg); };
                infoDiv.appendChild(nameDiv);
                
                const dateDiv = document.createElement('div');
                dateDiv.className = 'text-xs text-gray-400';
                dateDiv.textContent = sizeStr + ' • ' + new Date(file.date).toLocaleString();
                infoDiv.appendChild(dateDiv);
                leftDiv.appendChild(infoDiv);
                li.appendChild(leftDiv);

                const rightDiv = document.createElement('div');
                rightDiv.className = 'flex space-x-2';

                // 下载按钮 (无弹窗确认)
                const btnDown = document.createElement('button');
                btnDown.className = 'px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center';
                btnDown.textContent = '下载';
                btnDown.onclick = function() { handleDownload(file.url, displayName); };
                rightDiv.appendChild(btnDown);

                // 复制按钮 (智能判断)
                const btnCopy = document.createElement('button');
                btnCopy.className = 'px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center';
                btnCopy.textContent = isImg ? '复制' : '链接';
                btnCopy.onclick = function() { copyFileContent(file.url, isImg, displayName); };
                rightDiv.appendChild(btnCopy);

                const btnDel = document.createElement('button');
                btnDel.className = 'px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center';
                btnDel.textContent = '删除';
                btnDel.onclick = function() { deleteFile(file.key); };
                rightDiv.appendChild(btnDel);

                li.appendChild(rightDiv);
                fileListEl.appendChild(li);
            });
            showStatus('更新已保存 ^_^');
        } catch(e) { loadingEl.classList.add('hidden'); console.error(e); }
    }

    // === 2. 修改点：直接下载，无确认 ===
    async function handleDownload(url, filename) {
        showStatus('正在下载 ' + filename + ' ...', 'info');
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error('Network error');
            const blob = await response.blob();
            
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
            
            showStatus(filename + ' 已下载', 'success');
        } catch (e) {
            console.error(e);
            showStatus('下载失败，请重试', 'error');
        }
    }

    // === 3. 修改点：PC端强制尝试复制图片本体 ===
    async function copyFileContent(url, isImg, filename) {
        // 移动端：系统分享
        if (isImg && navigator.canShare && navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
            try {
                showStatus('正在调起分享...', 'info');
                const response = await fetch(url);
                const blob = await response.blob();
                const file = new File([blob], filename, { type: blob.type });
                await navigator.share({ files: [file], title: filename });
                return; 
            } catch (err) { console.log('Share failed', err); }
        }

        // PC端：强制尝试复制图片 Blob
        if (isImg) {
            try {
                showStatus('正在获取图片...', 'info');
                // 增加 cors 模式，确保允许跨域读取 Blob
                const response = await fetch(url, { mode: 'cors' });
                const blob = await response.blob();
                
                // 尝试直接写入 ClipboardItem
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
                showStatus('图片已复制');
            } catch (err) {
                console.error('Copy image failed:', err);
                // 仅当写入 Blob 失败时，才降级为复制链接
                navigator.clipboard.writeText(url).then(function() { showStatus('复制链接 (图片格式不支持)', 'info'); });
            }
        } else {
            // 非图片文件
            navigator.clipboard.writeText(url).then(function() { showStatus('链接已复制'); });
        }
    }

    async function deleteFile(key) {
        if(!confirm('确定删除文件?')) return;
        await fetch(API_BASE + '/delete', { method: 'POST', body: JSON.stringify({ key }) });
        refreshAll();
        showStatus('文件已删除');
    }

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const pasteTarget = document.getElementById('pasteTarget');

    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', function(e) { handleFiles(e.target.files); });

    document.addEventListener('paste', function(e) {
        if (e.target === pasteTarget || e.target === notepad) return; 
        handlePasteEvent(e);
    });

    pasteTarget.addEventListener('paste', function(e) {
        e.preventDefault(); 
        handlePasteEvent(e);
        pasteTarget.innerHTML = ''; 
        setTimeout(function() { pasteTarget.blur(); }, 100); 
    });
    
    function handlePasteEvent(e) {
        const items = e.clipboardData.items;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') files.push(items[i].getAsFile());
        }
        if (files.length > 0) {
            handleFiles(files);
        } else {
            showStatus('未检测到图片', 'info');
        }
    }

    async function handleFiles(files) {
        if (!files.length) return;
        showStatus('正在上传 ' + files.length + ' 个文件...', 'info');
        
        for (let file of files) {
            try {
                const signRes = await fetch(API_BASE + '/sign-upload', {
                    method: 'POST',
                    body: JSON.stringify({ filename: file.name, type: file.type })
                });
                const { url } = await signRes.json();
                await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                showStatus(file.name + ' 上传成功');
            } catch (e) { showStatus(file.name + ' 上传失败', 'error'); }
        }
        refreshAll();
    }

    window.preview = function(url, isImg) {
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
    window.closePreview = function() {
        document.getElementById('previewModal').classList.add('hidden');
        document.getElementById('previewImage').src = '';
    }

    refreshAll();
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
