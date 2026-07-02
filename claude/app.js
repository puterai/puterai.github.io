(function() {
    marked.setOptions({ breaks: true, gfm: true });

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderMarkdownWithMath(text) {
        if (!window.katex) {
            let html = marked.parse(text);
            return html.replace(/\s+$/, '');
        }
        
        let formulas = {}, idx = 0;
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, p) => {
            try { let h = katex.renderToString(p, { displayMode: true, throwOnError: false }); let ph = `@@KATEX_${idx++}@@`; formulas[ph] = h; return ph; } catch { return m; }
        }).replace(/\\\[([\s\S]*?)\\\]/g, (m, p) => {
            try { let h = katex.renderToString(p, { displayMode: true, throwOnError: false }); let ph = `@@KATEX_${idx++}@@`; formulas[ph] = h; return ph; } catch { return m; }
        }).replace(/\\\(([\s\S]*?)\\\)/g, (m, p) => {
            try { let h = katex.renderToString(p, { displayMode: false, throwOnError: false }); let ph = `@@KATEX_${idx++}@@`; formulas[ph] = h; return ph; } catch { return m; }
        }).replace(/\$([^\$]+?)\$/g, (m, p) => {
            try { let h = katex.renderToString(p, { displayMode: false, throwOnError: false }); let ph = `@@KATEX_${idx++}@@`; formulas[ph] = h; return ph; } catch { return m; }
        });
        
        let html = marked.parse(text);
        html = html.replace(/@@KATEX_(\d+)@@/g, (match) => formulas[match] || match);

        return html.replace(/\s+$/, '');
    }

    const MODEL_NAMES = {
        'claude-haiku-4-5': 'Claude Haiku 4.5',
        'claude-opus-4-8': 'Claude Opus 4.8',
        'claude-fable-5': 'Claude Fable 5'
    };
    
    const chatContainer = document.getElementById('chatContainer');
    const inputBox = document.getElementById('inputBox');
    const sendBtn = document.getElementById('sendButton');
    const welcome = document.getElementById('welcomeMessage');
    const claudeRefreshBtn = document.getElementById('claudeRefreshBtn');

    const pickerTrigger = document.getElementById('modelPickerTrigger');
    const dropdown = document.getElementById('modelPickerDropdown');
    const selectedLabelSpan = document.getElementById('selectedModelLabel');
    
    const checkHaiku = document.getElementById('checkHaiku');
    const checkOpus = document.getElementById('checkOpus');
    const checkFable = document.getElementById('checkFable');
    
    const haikuItem = document.querySelector('.dropdown-item[data-model="claude-haiku-4-5"]');
    const opusItem = document.querySelector('.dropdown-item[data-model="claude-opus-4-8"]');
    const fableItem = document.querySelector('.dropdown-item[data-model="claude-fable-5"]');

    let currentModelId = 'claude-haiku-4-5';

    const MAX_TOKENS = 32768;
    function countTokens(text) {
        if (!text) return 0;
        let tokens = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0x20000 && code <= 0x2A6DF) || (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
                tokens += 2;
            } else {
                tokens += 1;
            }
        }
        return tokens;
    }

    let messages = [];
    function messagesToText() {
        return messages.map(msg => (msg.role === 'user' ? '用户: ' : 'AI: ') + msg.content).join('\n');
    }
    function trimMessagesIfNeeded(limit = MAX_TOKENS) {
        let total = messages.reduce((sum, msg) => sum + msg.tokens, 0);
        while (total > limit && messages.length >= 2) {
            const removed1 = messages.shift();
            const removed2 = messages.shift();
            total -= (removed1.tokens + removed2.tokens);
        }
        while (total > limit && messages.length > 0) {
            const removed = messages.shift();
            total -= removed.tokens;
        }
    }

    let isThinking = false;
    let firstMessageSent = false;

    function updateSendButtonState() {
        sendBtn.disabled = isThinking || !inputBox.value.trim();
    }

    function createModelTag(modelId, elapsedSeconds = null) {
        if ((modelId === 'claude-opus-4-8' || modelId === 'claude-fable-5') && elapsedSeconds !== null) {
            let div = document.createElement('div');
            div.className = 'model-tag';
            let minutes = Math.floor(elapsedSeconds / 60), seconds = elapsedSeconds % 60;
            div.textContent = `Reasoned for ${minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}`;
            return div;
        }
        return null;
    }

    function updateDropdownSelection(modelId) {
        checkHaiku.style.display = modelId === 'claude-haiku-4-5' ? 'flex' : 'none';
        checkOpus.style.display = modelId === 'claude-opus-4-8' ? 'flex' : 'none';
        checkFable.style.display = modelId === 'claude-fable-5' ? 'flex' : 'none';
        
        if (modelId === 'claude-haiku-4-5') selectedLabelSpan.textContent = 'Haiku 4.5';
        else if (modelId === 'claude-opus-4-8') selectedLabelSpan.textContent = 'Opus 4.8';
        else if (modelId === 'claude-fable-5') selectedLabelSpan.textContent = 'Fable 5';
    }

    pickerTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!pickerTrigger.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    haikuItem.addEventListener('click', () => {
        currentModelId = 'claude-haiku-4-5';
        updateDropdownSelection(currentModelId);
        dropdown.classList.remove('active');
    });
    opusItem.addEventListener('click', () => {
        currentModelId = 'claude-opus-4-8';
        updateDropdownSelection(currentModelId);
        dropdown.classList.remove('active');
    });
    fableItem.addEventListener('click', () => {
        currentModelId = 'claude-fable-5';
        updateDropdownSelection(currentModelId);
        dropdown.classList.remove('active');
    });

    updateDropdownSelection(currentModelId);

    function createCopySVG() {
        const xmlns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(xmlns, "svg");
        svg.setAttribute("viewBox", "0 0 1024 1024");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        const path1 = document.createElementNS(xmlns, "path");
        path1.setAttribute("d", "M819.2 819.2v-68.266667h68.266667c40.96 0 68.266667-27.306667 68.266666-68.266666V136.533333c0-40.96-27.306667-68.266667-68.266666-68.266667H341.333333c-40.96 0-68.266667 27.306667-68.266666 68.266666v68.266667H204.8V136.533333c0-75.093333 61.44-136.533333 136.533333-136.533333h546.133334c75.093333 0 136.533333 61.44 136.533333 136.533333v546.133334c0 75.093333-61.44 136.533333-136.533333 136.533333h-68.266667z");
        path1.setAttribute("fill", "#66615c");
        const path2 = document.createElementNS(xmlns, "path");
        path2.setAttribute("d", "M136.533333 204.8h546.133334c75.093333 0 136.533333 61.44 136.533333 136.533333v546.133334c0 75.093333-61.44 136.533333-136.533333 136.533333H136.533333c-75.093333 0-136.533333-61.44-136.533333-136.533333V341.333333c0-75.093333 61.44-136.533333 136.533333-136.533333z m0 68.266667c-40.96 0-68.266667 27.306667-68.266666 68.266666v546.133334c0 40.96 27.306667 68.266667 68.266666 68.266666h546.133334c40.96 0 68.266667-27.306667 68.266666-68.266666V341.333333c0-40.96-27.306667-68.266667-68.266666-68.266666H136.533333z");
        path2.setAttribute("fill", "#66615c");
        svg.appendChild(path1);
        svg.appendChild(path2);
        return svg;
    }

    function createCheckSVG() {
        const xmlns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(xmlns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        const path = document.createElementNS(xmlns, "path");
        path.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z");
        path.setAttribute("fill", "#cc6543");
        svg.appendChild(path);
        return svg;
    }

    function setupCopyButton(btn, textToCopy) {
        btn.dataset.original = textToCopy;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const txt = e.currentTarget.dataset.original;
            if (txt && navigator.clipboard) {
                navigator.clipboard.writeText(txt).then(() => {
                    btn.innerHTML = '';
                    btn.appendChild(createCheckSVG());
                    setTimeout(() => {
                        btn.innerHTML = '';
                        btn.appendChild(createCopySVG());
                    }, 1500);
                }).catch(() => {});
            }
        });
    }

    function addMessage(text, isUser = false) {
        if (isUser && !firstMessageSent) {
            welcome.style.display = 'none';
            firstMessageSent = true;
        }
        
        let row = document.createElement('div');
        row.className = `msg-row ${isUser ? 'user' : 'ai'}`;

        let wrapper = document.createElement('div');
        wrapper.className = 'msg-content-wrapper';
        
        let bubble = document.createElement('div');
        bubble.className = `msg-bubble${isUser ? ' user' : ''}`;
        
        let msgText = document.createElement('div');
        msgText.className = 'msg-text';
        
        if (isUser) {
            msgText.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        } else {
            msgText.innerHTML = renderMarkdownWithMath(text);
        }
        
        bubble.appendChild(msgText);
        wrapper.appendChild(bubble);

        let copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.appendChild(createCopySVG());
        setupCopyButton(copyBtn, text);
        wrapper.appendChild(copyBtn);
        
        row.appendChild(wrapper);
        chatContainer.appendChild(row);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return msgText;
    }

    async function send() {
        if (isThinking) return;
        let text = inputBox.value.trim();
        if (!text) return;

        inputBox.value = '';
        inputBox.style.height = '';
        addMessage(text, true);

        trimMessagesIfNeeded(MAX_TOKENS);

        isThinking = true;
        updateSendButtonState();

        let thinkingRow = document.createElement('div');
        thinkingRow.className = 'msg-row ai';
        thinkingRow.innerHTML = '<div class="thinking-dot"></div>';
        chatContainer.appendChild(thinkingRow);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        let opts = { 
            stream: true, 
            model: currentModelId
        };

        const startTime = Date.now();
        let firstChunkReceived = false;
        let bubbleRow = null;
        let msgText = null;
        let full = '';

        try {
            let searchSummary = null;
            try {
                const searchOpts = {
                    model: 'gpt-4.1-nano',
                    tools: [{ type: 'web_search' }],
                    stream: false
                };
                const searchRes = await puter.ai.chat(text, searchOpts);
                const searchResult = searchRes?.text || searchRes?.toString?.() || '';
                if (searchResult && !searchResult.includes('无需联网')) {
                    searchSummary = searchResult.trim();
                }
            } catch (e) {
                console.error('Search agent error:', e);
            }

            let history = messagesToText();
            let currentUserMsg = '用户: ' + text;
            if (searchSummary) {
                currentUserMsg += '\n\n[联网搜索结果]: ' + searchSummary;
            }
            let prompt = (history ? history + '\n' : '') + currentUserMsg + '\nAI: ';

            let res = await puter.ai.chat(prompt, opts);
            
            for await (let part of res) {
                if (!firstChunkReceived) {
                    thinkingRow.remove();
                    thinkingRow = null;

                    let row = document.createElement('div');
                    row.className = 'msg-row ai';

                    let wrapper = document.createElement('div');
                    wrapper.className = 'msg-content-wrapper';
                    
                    let bubble = document.createElement('div');
                    bubble.className = 'msg-bubble';
                    
                    msgText = document.createElement('div');
                    msgText.className = 'msg-text';
                    
                    bubble.appendChild(msgText);
                    wrapper.appendChild(bubble);

                    let copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.appendChild(createCopySVG());
                    wrapper.appendChild(copyBtn);
                    
                    row.appendChild(wrapper);
                    chatContainer.appendChild(row);
                    bubbleRow = row;
                    firstChunkReceived = true;
                }

                if (part?.text) {
                    full += part.text;
                    msgText.innerHTML = renderMarkdownWithMath(full);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }

            if (!firstChunkReceived) {
                if (thinkingRow) thinkingRow.remove();
                addMessage('模型返回了空响应', false);
            } else {
                const userTokens = countTokens(text);
                const assistantTokens = countTokens(full);
                messages.push({ role: 'user', content: text, tokens: userTokens });
                messages.push({ role: 'assistant', content: full, tokens: assistantTokens });
                trimMessagesIfNeeded(MAX_TOKENS);

                let elapsed = Math.floor((Date.now() - startTime) / 1000);
                let tag = createModelTag(currentModelId, elapsed);
                if (tag) {
                    bubbleRow.insertBefore(tag, bubbleRow.firstChild);
                }

                const copyBtn = bubbleRow.querySelector('.copy-btn');
                if (copyBtn) {
                    setupCopyButton(copyBtn, full);
                }

                if (msgText && msgText.lastChild && msgText.lastChild.nodeType === 3 && /^\s*$/.test(msgText.lastChild.textContent)) {
                    msgText.removeChild(msgText.lastChild);
                }
            }

        } catch (err) {
            if (thinkingRow) thinkingRow.remove();
            addMessage('错误: ' + err.message, false);
        } finally {
            isThinking = false;
            updateSendButtonState();
            inputBox.focus();
        }
    }

    inputBox.addEventListener('input', () => {
        inputBox.style.height = 'auto';
        inputBox.style.height = Math.min(inputBox.scrollHeight, 140) + 'px';
        updateSendButtonState();
    });
    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isThinking && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            e.preventDefault();
            send();
        }
    });
    sendBtn.addEventListener('click', send);
    claudeRefreshBtn.addEventListener('click', () => location.reload());

    updateSendButtonState();
    inputBox.focus();

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());
})();
