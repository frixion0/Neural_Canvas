import { OpenAI } from 'https://cdn.skypack.dev/openai';

/**
 * Neural Canvas - AI Suite
 * Standardized logic for Image Generation, Web Building, and Intelligent Chat.
 */

// --- CONFIGURATION ---
/**
 * SECURITY WARNING:
 * Hardcoding API keys in frontend code is NOT recommended for production.
 * Ideally, these requests should be routed through a backend proxy
 * where the keys are stored in environment variables.
 */
const CONFIG = {
    // SECURITY WARNING: API keys should ideally be handled by a backend proxy.
    API_KEY: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    BASE_URL: "https://api.a4f.co/v1",
    PROXY_URL: 'https://9000-firebase-studio-1754744124282.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/api/proxy',
    MANIPULATE_API: 'https://ai-image-editor-eta.vercel.app/api/manipulate'
};

const clients = {
    image: new OpenAI({ apiKey: CONFIG.API_KEY, baseURL: CONFIG.BASE_URL, dangerouslyAllowBrowser: true }),
    builder: new OpenAI({ apiKey: CONFIG.API_KEY, baseURL: CONFIG.BASE_URL, dangerouslyAllowBrowser: true }),
    enhancer: new OpenAI({ apiKey: CONFIG.API_KEY, baseURL: CONFIG.BASE_URL, dangerouslyAllowBrowser: true }),
};

// --- SOUND SYSTEM ---
const sounds = {};
async function loadSound(name, url) {
    try {
        const audio = new Audio(url);
        sounds[name] = audio;
    } catch (e) { /* Fail silently */ }
}

function playSound(name) {
    if (sounds[name]) {
        sounds[name].currentTime = 0;
        sounds[name].play().catch(() => {});
    }
}

// --- CORE UTILITIES ---
function displayStatusMessage(elementId, type, message, duration = 5000) {
    const statusDiv = document.getElementById(elementId);
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = `generator-status-message ${type}`;
    statusDiv.style.display = 'block';
    if (type !== 'loading' && duration > 0) setTimeout(() => { statusDiv.style.display = 'none'; }, duration);
}

function saveToHistory(key, newItem) {
    try {
        const history = JSON.parse(localStorage.getItem(key)) || [];
        history.unshift({ ...newItem, id: Date.now() });
        if (history.length > 20) history.pop();
        localStorage.setItem(key, JSON.stringify(history));
    } catch (e) { console.error(e); }
}

function loadFromHistory(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}

async function generateImageFromProxy(model, promptText) {
    const response = await fetch(CONFIG.PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: promptText }),
    });
    if (!response.ok) throw new Error('Neural Node connection error. Please try again.');
    const data = await response.json();
    return model === 'uncen' ? data.imageUrl || (data.raw && data.raw.imageUrl) : data.imageUrl;
}

// --- IMAGE GENERATOR ---
let currentSelectedImageModel = 'img3';
const imageModels = [
    { id: 'img3', name: 'Imagen 3 (Standard)', description: 'High-quality photorealistic synthesis.' },
    { id: 'img4', name: 'Imagen 4 (Pro)', description: 'Next-gen detail and composition.' },
    { id: 'uncen', name: 'Uncensored (Experimental)', description: 'No content restrictions.' },
    { id: 'provider-2/FLUX.1-schnell-v2', name: 'FLUX Schnell', description: 'Optimized for speed.' }
];

function initImageGenerator() {
    const elements = {
        prompt: document.getElementById('imageGeneratorPromptInput'),
        btn: document.getElementById('generateImageButton'),
        res: document.getElementById('generatedImage'),
        container: document.getElementById('generatedImageContainer'),
        selector: document.getElementById('imageModelSelector'),
        selText: document.getElementById('selectedImageModelText'),
        modal: document.getElementById('modelSelectionModal'),
        modalCards: document.getElementById('modelCardsContainer'),
        enhance: document.getElementById('enhanceImagePrompt'),
        download: document.getElementById('generatedImageDownloadButton'),
        open: document.getElementById('openImageInNewTabButton'),
        editWithAi: document.getElementById('editWithAiButton'),
        share: document.getElementById('shareOnXButton'),
        historyBtn: document.getElementById('showImageHistoryBtn'),
        clearBtn: document.getElementById('clearImagePromptBtn'),
        historyModal: document.getElementById('imageHistoryModal'),
        historyGrid: document.getElementById('imageHistoryGridModal'),
        clearHistory: document.getElementById('clearImageHistoryModalBtn')
    };

    if (!elements.btn) return;

    elements.btn.onclick = async () => {
        const p = elements.prompt.value.trim();
        if (!p) return displayStatusMessage('imageGeneratorStatus', 'error', 'Please enter an image prompt.');
        elements.btn.disabled = true; elements.btn.classList.add('loading');
        displayStatusMessage('imageGeneratorStatus', 'loading', 'Synthesizing with neural networks...');
        playSound('tab_click');
        try {
            let url;
            if (['img3', 'img4', 'uncen'].includes(currentSelectedImageModel)) {
                url = await generateImageFromProxy(currentSelectedImageModel, p);
            } else {
                const res = await clients.image.images.generate({ model: currentSelectedImageModel, prompt: p });
                url = res.data[0].url;
            }
            if (!url) throw new Error('Image generation failed to return a result.');
            elements.res.src = url; elements.container.style.display = 'block';
            saveToHistory('imageHistory', { prompt: p, imageUrl: url });
            displayStatusMessage('imageGeneratorStatus', 'success', 'Vision materialized!');
            elements.container.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { displayStatusMessage('imageGeneratorStatus', 'error', e.message); }
        finally { elements.btn.disabled = false; elements.btn.classList.remove('loading'); }
    };

    elements.selector.onclick = () => {
        playSound('tab_click');
        elements.modal.style.display = 'flex';
        elements.modalCards.innerHTML = imageModels.map(m => `
            <div class="model-card ${m.id === currentSelectedImageModel ? 'selected' : ''}" data-id="${m.id}">
                <h4>${m.name}</h4><p>${m.description}</p>
            </div>
        `).join('');
        elements.modalCards.querySelectorAll('.model-card').forEach(c => {
            c.onclick = () => {
                playSound('tab_click');
                currentSelectedImageModel = c.dataset.id;
                elements.selText.textContent = imageModels.find(im => im.id === currentSelectedImageModel).name;
                elements.modal.style.display = 'none';
            };
        });
    };

    elements.enhance.onclick = async () => {
        const p = elements.prompt.value.trim();
        if (!p) return;
        playSound('tab_click');
        displayStatusMessage('imageGeneratorStatus', 'loading', 'Refining prompt with GPT-4o-mini...');
        try {
            const res = await clients.enhancer.chat.completions.create({
                model: "provider-6/gpt-4o-mini",
                messages: [{ role: "user", content: `Enhance this image prompt with professional descriptors and artistic styles: "${p}". Return ONLY the final prompt.` }]
            });
            elements.prompt.value = res.choices[0].message.content;
            displayStatusMessage('imageGeneratorStatus', 'success', 'Prompt professionally enhanced!');
        } catch (e) { displayStatusMessage('imageGeneratorStatus', 'error', 'Enhancement service unavailable.'); }
    };

    elements.download.onclick = () => {
        if (!elements.res.src) return;
        playSound('tab_click');
        const a = document.createElement('a');
        a.href = elements.res.src;
        a.download = `neural-canvas-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    elements.open.onclick = () => {
        if (elements.res.src) window.open(elements.res.src, '_blank');
    };

    if (elements.editWithAi) {
        elements.editWithAi.onclick = () => {
            if (elements.res.src) {
                window.location.href = `image-editor.html?image=${encodeURIComponent(elements.res.src)}`;
            }
        };
    }

    elements.share.onclick = () => {
        if (!elements.res.src) return;
        const text = encodeURIComponent("Check out this AI-generated vision by @NeuralCanvasAI!");
        const url = encodeURIComponent(window.location.href);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    };

    elements.clearBtn.onclick = () => {
        elements.prompt.value = '';
        elements.container.style.display = 'none';
        displayStatusMessage('imageGeneratorStatus', 'success', 'Canvas cleared.');
    };

    elements.historyBtn.onclick = () => {
        playSound('tab_click');
        const history = loadFromHistory('imageHistory');
        elements.historyGrid.innerHTML = history.length ? history.map(item => `
            <div class="history-card" onclick="window.open('${item.imageUrl}', '_blank')">
                <img src="${item.imageUrl}" alt="AI History">
                <div class="history-info"><p>${item.prompt}</p></div>
            </div>
        `).join('') : '<p class="empty-msg">No generation history yet.</p>';
        elements.historyModal.style.display = 'flex';
    };

    elements.clearHistory.onclick = () => {
        if (confirm('Permanently delete all generation history?')) {
            localStorage.removeItem('imageHistory');
            elements.historyGrid.innerHTML = '<p class="empty-msg">History cleared.</p>';
        }
    };
}

// --- WEBSITE BUILDER ---
function initWebsiteBuilder() {
    const elements = {
        prompt: document.getElementById('builderPromptInput'),
        btn: document.getElementById('buildWebsiteButton'),
        frame: document.getElementById('websitePreview'),
        container: document.getElementById('websitePreviewContainer'),
        model: document.getElementById('builderModel'),
        enhance: document.getElementById('enhanceBuilderPrompt'),
        download: document.getElementById('downloadCodeButton'),
        open: document.getElementById('openInNewTabButton'),
        edit: document.getElementById('editCodeButton'),
        remix: document.getElementById('changeWithAiButton'),
        clearBtn: document.getElementById('clearBuilderPromptBtn'),
        historyBtn: document.getElementById('showWebsiteProjectsBtn'),
        projectsModal: document.getElementById('websiteProjectsModal'),
        projectsList: document.getElementById('websiteProjectsListModal'),
        clearProjects: document.getElementById('clearWebsiteProjectsModalBtn'),
        editorModal: document.getElementById('codeEditorModal'),
        editorText: document.getElementById('codeEditorTextarea'),
        updateBtn: document.getElementById('updatePreviewButton'),
        closeEditor: document.getElementById('closeCodeEditorBtn'),
        desktop: document.getElementById('previewDesktop'),
        tablet: document.getElementById('previewTablet'),
        mobile: document.getElementById('previewMobile')
    };

    if (!elements.btn) return;

    let currentCode = '';

    const updateFrame = (code) => {
        const blob = new Blob([code], { type: 'text/html' });
        elements.frame.src = URL.createObjectURL(blob);
    };

    elements.btn.onclick = async () => {
        const p = elements.prompt.value.trim();
        if (!p) return displayStatusMessage('builderStatus', 'error', 'Describe the website you want to build.');
        elements.btn.disabled = true; elements.btn.classList.add('loading');
        displayStatusMessage('builderStatus', 'loading', 'Generating source code and assets...');
        playSound('tab_click');
        try {
            const res = await clients.builder.chat.completions.create({
                model: elements.model.value,
                messages: [
                    { role: "system", content: "You are an elite frontend developer. Return ONLY pure HTML, CSS, and JS. Do not use Markdown markers like ```html. Ensure the design is modern, responsive, and professional." },
                    { role: "user", content: p }
                ]
            });
            currentCode = res.choices[0].message.content;
            updateFrame(currentCode);
            elements.container.style.display = 'block';
            saveToHistory('websiteHistory', { prompt: p, code: currentCode });
            displayStatusMessage('builderStatus', 'success', 'Deployment successful!');
            elements.container.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { displayStatusMessage('builderStatus', 'error', 'Code generation failed.'); }
        finally { elements.btn.disabled = false; elements.btn.classList.remove('loading'); }
    };

    if (elements.enhance) {
        elements.enhance.onclick = async () => {
            const p = elements.prompt.value.trim();
            if (!p) return;
            playSound('tab_click');
            displayStatusMessage('builderStatus', 'loading', 'Expanding project scope...');
            try {
                const res = await clients.enhancer.chat.completions.create({
                    model: "provider-6/gpt-4o-mini",
                    messages: [{ role: "user", content: `Convert this simple description into a comprehensive technical requirement for a high-end web application: "${p}". Return ONLY the text.` }]
                });
                elements.prompt.value = res.choices[0].message.content;
                displayStatusMessage('builderStatus', 'success', 'Requirement refined!');
            } catch (e) { displayStatusMessage('builderStatus', 'error', 'Failed to refine.'); }
        };
    }

    elements.download.onclick = () => {
        if (!currentCode) return;
        const b = new Blob([currentCode], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'neural-canvas-website.html';
        a.click();
    };

    elements.open.onclick = () => {
        if (!currentCode) return;
        const w = window.open();
        w.document.open();
        w.document.write(currentCode);
        w.document.close();
    };

    elements.edit.onclick = () => {
        elements.editorText.value = currentCode;
        elements.editorModal.style.display = 'flex';
    };

    elements.updateBtn.onclick = () => {
        currentCode = elements.editorText.value;
        updateFrame(currentCode);
        elements.editorModal.style.display = 'none';
        displayStatusMessage('builderStatus', 'success', 'Preview updated.');
    };

    elements.remix.onclick = async () => {
        const instr = prompt('Describe the changes you want (e.g., "Change theme to neon blue", "Add a gallery section"):');
        if (!instr) return;
        playSound('tab_click');
        displayStatusMessage('builderStatus', 'loading', 'Applying AI Remix...');
        try {
            const res = await clients.builder.chat.completions.create({
                model: elements.model.value,
                messages: [
                    { role: "system", content: "You are a UI/UX expert. Modify the existing code based on user instructions. Return ONLY the new pure HTML/CSS/JS code." },
                    { role: "user", content: `Original Code: ${currentCode}\n\nInstructions: ${instr}` }
                ]
            });
            currentCode = res.choices[0].message.content;
            updateFrame(currentCode);
            displayStatusMessage('builderStatus', 'success', 'Remix applied successfully!');
        } catch (e) { displayStatusMessage('builderStatus', 'error', 'Remix failed.'); }
    };

    if (elements.clearBtn) {
        elements.clearBtn.onclick = () => {
            elements.prompt.value = '';
            elements.container.style.display = 'none';
            displayStatusMessage('builderStatus', 'success', 'Cleared.');
        };
    }

    elements.historyBtn.onclick = () => {
        const history = loadFromHistory('websiteHistory');
        window.websiteHistoryItems = history;
        elements.projectsList.innerHTML = history.length ? history.map((item, index) => `
            <div class="history-item-list" data-index="${index}">
                <strong>${item.prompt.substring(0, 40)}...</strong>
                <span>${new Date(item.id).toLocaleDateString()}</span>
            </div>
        `).join('') : '<p class="empty-msg">No saved projects.</p>';

        elements.projectsList.querySelectorAll('.history-item-list').forEach(item => {
            item.onclick = () => {
                const index = item.dataset.index;
                const project = window.websiteHistoryItems[index];
                currentCode = project.code;
                updateFrame(currentCode);
                elements.container.style.display = 'block';
                elements.projectsModal.style.display = 'none';
                displayStatusMessage('builderStatus', 'success', 'Project loaded from history.');
            };
        });

        elements.projectsModal.style.display = 'flex';
    };

    // Responsive controls
    const setView = (w) => {
        elements.frame.style.width = w;
        [elements.desktop, elements.tablet, elements.mobile].forEach(b => b.classList.remove('active'));
    };
    elements.desktop.onclick = () => { setView('100%'); elements.desktop.classList.add('active'); };
    elements.tablet.onclick = () => { setView('768px'); elements.tablet.classList.add('active'); };
    elements.mobile.onclick = () => { setView('375px'); elements.mobile.classList.add('active'); };
}

// --- CHATBOT ---
function initChatbot() {
    const elements = {
        input: document.getElementById('botInput'),
        btn: document.getElementById('sendBotButton'),
        msgs: document.getElementById('chatMessages'),
        upload: document.getElementById('chatImageUpload'),
        imgPreview: document.getElementById('chatImagePreview'),
        imgPreviewContainer: document.getElementById('chatImagePreviewContainer'),
        removeImg: document.getElementById('removeChatImageBtn')
    };
    if (!elements.btn) return;

    let selectedImg = null;

    elements.upload.onchange = (e) => {
        const f = e.target.files[0];
        if (f) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                selectedImg = ev.target.result;
                elements.imgPreview.src = selectedImg;
                elements.imgPreviewContainer.style.display = 'block';
            };
            reader.readAsDataURL(f);
        }
    };

    elements.removeImg.onclick = () => {
        selectedImg = null;
        elements.imgPreviewContainer.style.display = 'none';
        elements.upload.value = '';
    };

    const sendMessage = async () => {
        const t = elements.input.value.trim();
        if (!t && !selectedImg) return;
        playSound('tab_click');

        const userMsg = document.createElement('div');
        userMsg.className = 'message user-message';
        userMsg.innerHTML = `<div class="message-content"><div class="message-text">${t}${selectedImg ? '<br><img src="'+selectedImg+'" class="chat-attached-img">' : ''}</div></div>`;
        elements.msgs.appendChild(userMsg);
        elements.input.value = '';
        elements.msgs.scrollTop = elements.msgs.scrollHeight;

        // Clear image preview
        selectedImg = null;
        elements.imgPreviewContainer.style.display = 'none';

        elements.btn.disabled = true; elements.btn.classList.add('loading');
        try {
            const content = [];
            if (t) content.push({ type: "text", text: t });
            if (selectedImg) content.push({ type: "image_url", image_url: { url: selectedImg } });

            const res = await clients.enhancer.chat.completions.create({
                model: "provider-6/gpt-4o-mini",
                messages: [{ role: "user", content: content.length ? content : t }]
            });

            const reply = document.createElement('div');
            reply.className = 'message bot-message';
            reply.innerHTML = `<div class="message-content"><div class="message-avatar">🤖</div><div class="message-text">${res.choices[0].message.content}</div></div>`;
            elements.msgs.appendChild(reply);
            elements.msgs.scrollTop = elements.msgs.scrollHeight;
        } catch (e) {
            displayStatusMessage('botStatus', 'error', 'Communication interrupted.');
        } finally {
            elements.btn.disabled = false; elements.btn.classList.remove('loading');
        }
    };

    elements.btn.onclick = sendMessage;
    elements.input.onkeypress = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
}

// --- IMAGE EDITOR ---
function initImageEditor() {
    const elements = {
        upload: document.getElementById('imageUpload'),
        drop: document.getElementById('imageDropZone'),
        preview: document.getElementById('imagePreview'),
        pContainer: document.getElementById('imagePreviewContainer'),
        remove: document.getElementById('removeImageBtn'),
        controls: document.getElementById('editorControls'),
        prompt: document.getElementById('editorPromptInput'),
        btn: document.getElementById('editImageButton'),
        res: document.getElementById('editedImage'),
        resContainer: document.getElementById('editedImageContainer'),
        presets: document.querySelectorAll('.preset-filters button'),
        download: document.getElementById('downloadEditedImageButton'),
        editAgain: document.getElementById('editAgainButton'),
        enhance: document.getElementById('enhanceImageEditPrompt'),
        clear: document.getElementById('clearImageEditPromptBtn')
    };

    if (!elements.upload) return;

    let selectedImg = null;

    // Handle incoming image from URL (e.g. from Image Generator)
    const urlParams = new URLSearchParams(window.location.search);
    const incomingImage = urlParams.get('image');
    if (incomingImage) {
        selectedImg = incomingImage;
        elements.preview.src = selectedImg;
        elements.pContainer.style.display = 'block';
        elements.controls.style.display = 'block';
        elements.drop.style.display = 'none';
    }

    const handleFile = (f) => {
        if (f) {
            if (f.size > 5 * 1024 * 1024) return displayStatusMessage('imageEditorStatus', 'error', 'Limit exceeded (5MB max).');
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedImg = e.target.result;
                elements.preview.src = selectedImg;
                elements.pContainer.style.display = 'block';
                elements.controls.style.display = 'block';
                elements.drop.style.display = 'none';
            };
            reader.readAsDataURL(f);
        }
    };

    elements.upload.onchange = (e) => handleFile(e.target.files[0]);
    elements.drop.onclick = () => elements.upload.click();
    elements.remove.onclick = () => {
        selectedImg = null;
        elements.pContainer.style.display = 'none';
        elements.controls.style.display = 'none';
        elements.drop.style.display = 'block';
        elements.resContainer.style.display = 'none';
    };

    elements.presets.forEach(p => {
        p.onclick = () => { elements.prompt.value = p.dataset.instruction; elements.prompt.focus(); };
    });

    elements.btn.onclick = async () => {
        const t = elements.prompt.value.trim();
        if (!t || !selectedImg) return;
        playSound('tab_click');
        elements.btn.disabled = true; elements.btn.classList.add('loading');
        displayStatusMessage('imageEditorStatus', 'loading', 'Analyzing and transforming source data...');
        try {
            const response = await fetch(CONFIG.MANIPULATE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoDataUri: selectedImg, instructions: t }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'The neural processor failed to edit the image.');
            
            elements.res.src = data.editedPhotoDataUri;
            elements.resContainer.style.display = 'block';
            displayStatusMessage('imageEditorStatus', 'success', 'Image successfully transformed!');
            elements.resContainer.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { displayStatusMessage('imageEditorStatus', 'error', e.message); }
        finally { elements.btn.disabled = false; elements.btn.classList.remove('loading'); }
    };

    elements.editAgain.onclick = () => {
        selectedImg = elements.res.src;
        elements.preview.src = selectedImg;
        elements.resContainer.style.display = 'none';
        elements.prompt.value = '';
    };

    elements.download.onclick = () => {
        if (!elements.res.src) return;
        const a = document.createElement('a');
        a.href = elements.res.src;
        a.download = `neural-edit-${Date.now()}.png`;
        a.click();
    };

    if (elements.enhance) {
        elements.enhance.onclick = async () => {
            const p = elements.prompt.value.trim();
            if (!p) return;
            displayStatusMessage('imageEditorStatus', 'loading', 'Enhancing instructions...');
            try {
                const res = await clients.enhancer.chat.completions.create({
                    model: "provider-6/gpt-4o-mini",
                    messages: [{ role: "user", content: `Refine these image editing instructions for an AI: "${p}". Return ONLY the refined version.` }]
                });
                elements.prompt.value = res.choices[0].message.content;
                displayStatusMessage('imageEditorStatus', 'success', 'Instructions refined!');
            } catch (e) { displayStatusMessage('imageEditorStatus', 'error', 'Failed.'); }
        };
    }

    if (elements.clear) {
        elements.clear.onclick = () => {
            elements.prompt.value = '';
            displayStatusMessage('imageEditorStatus', 'success', 'Instructions cleared.');
        };
    }
}

// --- API DOCS ---
function initApiDocs() {
    document.querySelectorAll('.copy-code-btn').forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.dataset.target;
            const code = document.getElementById(targetId).innerText;
            navigator.clipboard.writeText(code);
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('success');
            setTimeout(() => { btn.textContent = originalText; btn.classList.remove('success'); }, 2000);
        };
    });
}

// --- GLOBAL UI & ANIMATIONS ---
function initUI() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const nav = document.querySelector('.main-nav');
    if (menuBtn) menuBtn.onclick = () => { nav.classList.toggle('active'); menuBtn.classList.toggle('active'); };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in-active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-animate]').forEach(el => { el.classList.add('animate-in-init'); observer.observe(el); });

    const btt = document.getElementById('backToTop');
    if (btt) {
        window.addEventListener('scroll', () => { if (window.scrollY > 500) btt.classList.add('visible'); else btt.classList.remove('visible'); });
        btt.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('.feature-card, .tool-wrapper, .model-card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            card.style.setProperty('--x', `${e.clientX - r.left}px`);
            card.style.setProperty('--y', `${e.clientY - r.top}px`);
        });
    });

    document.querySelectorAll('.action-btn, .hero-cta, .nav-link').forEach(btn => {
        btn.addEventListener('mousemove', e => {
            const r = btn.getBoundingClientRect();
            const x = e.clientX - r.left - r.width / 2;
            const y = e.clientY - r.top - r.height / 2;
            btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
        });
        btn.addEventListener('mouseleave', () => btn.style.transform = '');
    });
}

// --- BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
    loadSound('tab_click', 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
    initUI();
    initImageGenerator();
    initWebsiteBuilder();
    initChatbot();
    initImageEditor();
    initApiDocs();
    
    // Generic Modal Close logic
    document.querySelectorAll('.close-modal-btn').forEach(b => b.onclick = () => {
        const modal = b.closest('.modal-overlay');
        if (modal) modal.style.display = 'none';
    });
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none'; });
});
