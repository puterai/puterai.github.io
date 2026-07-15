(function() {
    marked.setOptions({ breaks: true, gfm: true });
    const loginBtn = document.getElementById('loginBtn');
    const inputContainer = document.getElementById('inputContainer');
    const chatContainer = document.getElementById('chatContainer');
    const inputBox = document.getElementById('inputBox');
    const sendBtn = document.getElementById('sendButton');
    const webToggle = document.getElementById('webSearchToggle');
    const welcome = document.getElementById('welcomeMessage');
    const logoWrapper = document.getElementById('logoWrapper');
    const pickerTrigger = document.getElementById('modelPickerTrigger');
    const dropdown = document.getElementById('modelPickerDropdown');
    const secondaryDropdown = document.getElementById('modelPickerSecondaryDropdown');
    const selectedModelLabel = document.getElementById('selectedModelLabel');
    const selectedIntensityLabel = document.getElementById('selectedIntensityLabel');
    const modelHeaderToggle = document.getElementById('modelHeaderToggle');
    const intensityHeaderToggle = document.getElementById('intensityHeaderToggle');
    const modelSubList = document.getElementById('modelSubList');
    const intensitySubList = document.getElementById('intensitySubList');
    const MAX_TOKENS = 32768;
    let messages = [];
    let isThinking = false, webEnabled = false, hasSent = false;
    let currentModel = '5.5', currentIntensity = 'mid';
    const API_MAP = {
        '5.5': { 'mid': 'openai/gpt-5.5', 'high': 'openai/gpt-5.5-pro' },
        '5.6 Sol': { 'mid': 'openai/gpt-5.6-sol', 'high': 'openai/gpt-5.6-sol-pro' },
        '5.6 Terra': { 'mid': 'openai/gpt-5.6-terra', 'high': 'openai/gpt-5.6-terra-pro' },
        '5.6 Luna': { 'mid': 'openai/gpt-5.6-luna', 'high': 'openai/gpt-5.6-luna-pro' },
        '5.4': { 'mid': 'openai/gpt-5.4', 'high': 'openai/gpt-5.4-pro' },
        '5.4 Mini': { 'mid': 'openai/gpt-5.4-nano', 'high': 'openai/gpt-5.4-mini' }
    };
    welcome.textContent = ['有什么可以帮忙的？','我们先从哪里开始呢？','准备好了','今天有什么计划？','您今天在想什么？'][Math.floor(Math.random()*5)];
    function checkAuthStatus() {
        if (puter.auth.isSignedIn()) {
            loginBtn.style.display = 'none';
            inputBox.disabled = false;
            inputBox.placeholder = "有问题，尽管问";
            inputContainer.classList.remove('disabled-mask');
            updateSendButtonState();
        } else {
            loginBtn.style.display = 'block';
            inputBox.disabled = true;
            inputBox.placeholder = "请先 Log in 以使用";
            sendBtn.disabled = true;
            inputContainer.classList.add('disabled-mask');
        }
    }
    loginBtn.addEventListener('click', async () => {
        try { await puter.auth.signIn(); checkAuthStatus(); } catch (err) { console.error(err); }
    });
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function renderMarkdownWithMath(text) {
        if (!window.katex) return marked.parse(text).replace(/\s+$/, '');
        let formulas = {}, idx = 0;
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, p) => {
            try { return formulas['@@KATEX_'+idx+'@@'] = katex.renderToString(p, { displayMode: true, throwOnError: false }), '@@KATEX_'+(idx++)+'@@'; } catch { return m; }
        }).replace(/\\\[([\s\S]*?)\\\]/g, (m, p) => {
            try { return formulas['@@KATEX_'+idx+'@@'] = katex.renderToString(p, { displayMode: true, throwOnError: false }), '@@KATEX_'+(idx++)+'@@'; } catch { return m; }
        }).replace(/\\\(([\s\S]*?)\\\)/g, (m, p) => {
            try { return formulas['@@KATEX_'+idx+'@@'] = katex.renderToString(p, { displayMode: false, throwOnError: false }), '@@KATEX_'+(idx++)+'@@'; } catch { return m; }
        }).replace(/\$([^\$]+?)\$/g, (m, p) => {
            try { return formulas['@@KATEX_'+idx+'@@'] = katex.renderToString(p, { displayMode: false, throwOnError: false }), '@@KATEX_'+(idx++)+'@@'; } catch { return m; }
        });
        return marked.parse(text).replace(/@@KATEX_(\d+)@@/g, (match, id) => formulas[match] || match).replace(/\s+$/, '');
    }
    function countTokens(text) {
        if (!text) return 0;
        let tokens = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            tokens += ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0x20000 && code <= 0x2A6DF) || (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) ? 2 : 1;
        }
        return tokens;
    }
    function messagesToText() {
        return messages.map(msg => (msg.role === 'user' ? '用户: ' : 'AI: ') + msg.content).join('\n');
    }
    function trimMessagesIfNeeded(limit) {
        if (limit === undefined) limit = MAX_TOKENS;
        let total = messages.reduce((sum, msg) => sum + msg.tokens, 0);
        while (total > limit && messages.length >= 2) {
            const removed1 = messages.shift(); const removed2 = messages.shift();
            total -= (removed1.tokens + removed2.tokens);
        }
    }
    function updateSendButtonState() {
        if (!puter.auth.isSignedIn()) { sendBtn.disabled = true; return; }
        sendBtn.disabled = isThinking || !inputBox.value.trim();
    }
    function closeAllDropdowns() {
        dropdown.classList.remove('active');
        secondaryDropdown.classList.remove('active');
        modelSubList.classList.remove('active');
        intensitySubList.classList.remove('active');
    }
    pickerTrigger.addEventListener('click', (e) => {
        if (!puter.auth.isSignedIn()) return;
        e.stopPropagation();
        const isActive = dropdown.classList.toggle('active');
        if (!isActive) {
            secondaryDropdown.classList.remove('active');
            modelSubList.classList.remove('active');
            intensitySubList.classList.remove('active');
        } else {
            const triggerRect = pickerTrigger.getBoundingClientRect();
            const containerRect = inputContainer.getBoundingClientRect();
            const rightOffset = containerRect.right - triggerRect.right;
            dropdown.style.right = rightOffset + 'px';
            secondaryDropdown.style.right = (rightOffset + 124) + 'px';
        }
    });
    modelHeaderToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!dropdown.classList.contains('active')) return;
        intensitySubList.classList.remove('active');
        const isModelActive = modelSubList.classList.toggle('active');
        if (isModelActive) {
            secondaryDropdown.classList.add('active');
        } else {
            secondaryDropdown.classList.remove('active');
        }
    });
    intensityHeaderToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!dropdown.classList.contains('active')) return;
        modelSubList.classList.remove('active');
        const isIntensityActive = intensitySubList.classList.toggle('active');
        if (isIntensityActive) {
            secondaryDropdown.classList.add('active');
        } else {
            secondaryDropdown.classList.remove('active');
        }
    });
    document.addEventListener('click', (e) => {
        if (!inputContainer.contains(e.target)) {
            closeAllDropdowns();
        }
    });
    document.querySelectorAll('.model-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.model-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            currentModel = item.dataset.model;
            selectedModelLabel.textContent = currentModel;
            closeAllDropdowns();
        });
    });
    document.querySelectorAll('.intensity-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.intensity-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            currentIntensity = item.dataset.intensity;
            selectedIntensityLabel.textContent = item.textContent;
            closeAllDropdowns();
        });
    });
    function createCopySVG() {
        const xmlns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(xmlns, "svg");
        svg.setAttribute("viewBox", "0 0 20 20");
        svg.style.width = "18px";
        svg.style.height = "18px";
        const path = document.createElementNS(xmlns, "path");
        path.setAttribute("d", "M12.668 10.667c0-.71 0-1.204-.031-1.588a2.4 2.4 0 0 0-.113-.615l-.055-.13a1.84 1.84 0 0 0-.676-.731l-.127-.072c-.158-.08-.37-.137-.745-.168-.384-.031-.877-.031-1.588-.031H6.5c-.711 0-1.204 0-1.588.031a2.4 2.4 0 0 0-.615.113l-.13.055a1.84 1.84 0 0 0-.731.676l-.07.127c-.081.158-.138.37-.169.745-.031.384-.032.877-.032 1.588V13.5c0 .711 0 1.204.032 1.588.031.376.088.587.168.745l.07.126c.177.288.43.522.732.676l.13.056c.144.052.333.089.615.112.384.031.877.032 1.588.032h2.833c.71 0 1.204 0 1.588-.032.376-.031.587-.088.745-.168l.127-.07c.287-.177.522-.43.676-.732l.055-.13c.052-.144.09-.333.113-.615.031-.384.031-.877.031-1.588zm1.33 1.998c.455-.002.803-.005 1.09-.028.376-.031.587-.088.745-.168l.126-.071c.288-.177.522-.43.676-.732l.056-.13a2.4 2.4 0 0 0 .112-.615c.031-.384.032-.877.032-1.588V6.5c0-.711 0-1.204-.032-1.588a2.4 2.4 0 0 0-.112-.615l-.056-.13a1.84 1.84 0 0 0-.676-.731l-.126-.07c-.158-.081-.37-.138-.745-.169-.384-.031-.877-.032-1.588-.032h-2.833c-.71 0-1.204.001-1.588.032-.282.023-.471.06-.615.112l-.13.056a1.84 1.84 0 0 0-.731.676l-.072.126c-.08.158-.137.37-.168.745-.023.287-.027.635-.029 1.09h1.999c.689 0 1.246 0 1.696.036.458.038.865.117 1.242.309l.217.122c.496.304.9.74 1.165 1.26l.067.143c.144.337.21.698.242 1.099.037.45.036 1.007.036 1.696zm4.167-3.332c0 .689 0 1.246-.036 1.696-.033.401-.098.762-.242 1.099l-.067.143c-.265.52-.67.956-1.165 1.26l-.219.122c-.376.192-.782.271-1.24.309-.337.027-.734.031-1.2.033-.003.467-.007.864-.034 1.201-.033.401-.098.762-.242 1.098l-.067.142c-.265.522-.669.958-1.165 1.262l-.217.122c-.377.192-.784.271-1.242.309-.45.037-1.007.036-1.696.036H6.5c-.69 0-1.246 0-1.696-.036-.4-.033-.762-.098-1.098-.242l-.143-.067a3.17 3.17 0 0 1-1.261-1.165l-.122-.219c-.192-.376-.271-.782-.309-1.24-.037-.45-.036-1.007-.036-1.696v-2.833c0-.689 0-1.246.036-1.696.038-.458.117-.865.309-1.242l.122-.217c.304-.496.74-.9 1.261-1.165l.143-.067c.336-.144.697-.21 1.098-.242.337-.027.733-.032 1.2-.034.002-.467.007-.863.034-1.2.037-.458.117-.864.309-1.24l.122-.22c.304-.495.74-.899 1.26-1.164l.143-.067c.337-.144.698-.21 1.099-.242.45-.037 1.007-.036 1.696-.036H13.5c.69 0 1.246 0 1.696.036.458.038.864.117 1.24.309l.22.122c.495.304.899.74 1.164 1.261l.067.143c.144.336.21.697.242 1.098.037.45.036 1.007.036 1.696z");
        path.setAttribute("fill", "#1565c0");
        svg.appendChild(path); return svg;
    }
    function createCheckSVG() {
        const xmlns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(xmlns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        const path = document.createElementNS(xmlns, "path");
        path.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z");
        path.setAttribute("fill", "#1565c0");
        svg.appendChild(path); return svg;
    }
    function setupCopyButton(btn, textToCopy) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (textToCopy && navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    btn.innerHTML = ''; btn.appendChild(createCheckSVG());
                    setTimeout(() => { btn.innerHTML = ''; btn.appendChild(createCopySVG()); }, 1500);
                }).catch(() => {});
            }
        });
    }
    function addMessage(text, isUser) {
        if (isUser === undefined) isUser = false;
        if (isUser && !hasSent) { welcome.style.display = 'none'; hasSent = true; }
        let row = document.createElement('div');
        row.className = 'msg-row ' + (isUser ? 'user' : 'ai');
        let bubble = document.createElement('div');
        bubble.className = 'msg-bubble' + (isUser ? ' user' : '');
        let msgText = document.createElement('div');
        msgText.className = 'msg-text';
        if (isUser) { msgText.innerHTML = escapeHtml(text).replace(/\n/g, '<br>'); }
        else { msgText.innerHTML = renderMarkdownWithMath(text); }
        bubble.appendChild(msgText); row.appendChild(bubble);
        let copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn'; copyBtn.appendChild(createCopySVG());
        setupCopyButton(copyBtn, text); row.appendChild(copyBtn);
        chatContainer.appendChild(row); chatContainer.scrollTop = chatContainer.scrollHeight;
        return msgText;
    }
    async function send() {
        if (isThinking) return;
        let text = inputBox.value.trim(); if (!text) return;
        inputBox.value = ''; inputBox.style.height = '';
        addMessage(text, true);
        let finalModel = API_MAP[currentModel][currentIntensity];
        trimMessagesIfNeeded(MAX_TOKENS);
        isThinking = true; updateSendButtonState();
        let thinkingRow = document.createElement('div');
        thinkingRow.className = 'msg-row ai';
        thinkingRow.innerHTML = '<div class="thinking-dot"></div>';
        chatContainer.appendChild(thinkingRow); chatContainer.scrollTop = chatContainer.scrollHeight;
        let opts = { stream: true, model: finalModel };
        if (webEnabled) opts.tools = [{ type: 'web_search' }];
        let firstChunkReceived = false, msgText = null, full = '';
        try {
            let history = messagesToText();
            let prompt = (history ? history + '\n' : '') + '用户: ' + text + '\nAI: ';
            let res = await puter.ai.chat(prompt, opts);
            for await (let part of res) {
                if (!firstChunkReceived) {
                    thinkingRow.remove(); thinkingRow = null;
                    let row = document.createElement('div'); row.className = 'msg-row ai';
                    let tag = document.createElement('div'); tag.className = 'model-tag';
                    tag.textContent = currentModel + ' ' + (currentIntensity === 'mid' ? '中' : '高');
                    row.appendChild(tag);
                    let bubble = document.createElement('div'); bubble.className = 'msg-bubble';
                    msgText = document.createElement('div'); msgText.className = 'msg-text';
                    bubble.appendChild(msgText); row.appendChild(bubble);
                    let copyBtn = document.createElement('button'); copyBtn.className = 'copy-btn';
                    copyBtn.appendChild(createCopySVG()); row.appendChild(copyBtn);
                    chatContainer.appendChild(row); firstChunkReceived = true;
                    setupCopyButton(copyBtn, '');
                }
                if (part && part.text) {
                    full += part.text; msgText.innerHTML = renderMarkdownWithMath(full);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }
            if (!firstChunkReceived) { if (thinkingRow) thinkingRow.remove(); addMessage('模型返回了空响应', false); }
            else {
                messages.push({ role: 'user', content: text, tokens: countTokens(text) });
                messages.push({ role: 'assistant', content: full, tokens: countTokens(full) });
                trimMessagesIfNeeded(MAX_TOKENS);
                let lastRow = chatContainer.lastChild;
                let lastCopyBtn = lastRow ? lastRow.querySelector('.copy-btn') : null;
                if (lastCopyBtn) setupCopyButton(lastCopyBtn, full);
            }
        } catch (err) { if (thinkingRow) thinkingRow.remove(); addMessage('错误: ' + err.message, false); }
        finally { isThinking = false; updateSendButtonState(); inputBox.focus(); }
    }
    inputBox.addEventListener('input', () => {
        inputBox.style.height = 'auto'; inputBox.style.height = Math.min(inputBox.scrollHeight, 132) + 'px';
        updateSendButtonState();
    });
    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isThinking && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            e.preventDefault(); send();
        }
    });
    sendBtn.addEventListener('click', send);
    webToggle.addEventListener('click', () => { webEnabled = !webEnabled; webToggle.classList.toggle('active', webEnabled); });
    logoWrapper.addEventListener('click', () => location.reload());
    checkAuthStatus();
})();
