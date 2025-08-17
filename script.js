import { OpenAI } from 'https://cdn.skypack.dev/openai';

// --- GLOBAL VARIABLES & SETUP ---

let selectedFile = null;
let selectedChatImage = null;
let currentSelectedImageStyle = 'photorealistic';
let currentSelectedImageModel = 'provider-2/FLUX.1-schnell-v2';
let currentWebsiteCode = '';
let currentWebsitePrompt = '';

const clients = {
    image: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
    builder: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
    bot: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
    enhancer: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
};

// --- SOUND EFFECTS ---
let audioContext;
const soundBuffers = {};
async function loadSound(name, url) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    soundBuffers[name] = await audioContext.decodeAudioData(arrayBuffer);
}
function playSound(name) {
    if (!soundBuffers[name]) return;
    const source = audioContext.createBufferSource();
    source.buffer = soundBuffers[name];
    source.connect(audioContext.destination);
    source.start(0);
}

// --- UTILITY FUNCTIONS ---
function displayStatusMessage(elementId, type, message, duration = 3000) {
    const statusDiv = document.getElementById(elementId);
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = `generator-status-message ${type}`;
    statusDiv.style.display = 'block';
    if (type !== 'loading') {
        setTimeout(() => { statusDiv.style.display = 'none'; }, duration);
    }
}
function clearStatusMessage(elementId) {
    const statusDiv = document.getElementById(elementId);
    if (statusDiv) statusDiv.style.display = 'none';
}

// --- IMAGE GENERATION PROXY ---
async function generateImageFromProxy(promptText) {
    const apiUrl = 'https://9000-firebase-studio-1754744124282.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/api/proxy';
    const response = await fetch(apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'uncen', prompt: promptText }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }
    const data = await response.json();
    return data.imageUrl;
}

// --- DATA ---
const imageModels = [
    { id: 'uncen', name: 'Uncensored', description: 'Generates images without content restrictions (use responsibly).', isUncen: true },
    { id: 'provider-2/FLUX.1-schnell-v2', name: 'FLUX.1 Schnell v2', description: 'Optimized for speed and quality, excellent for general use.', isUncen: false },
    { id: 'provider-3/FLUX.1-dev', name: 'FLUX.1 Dev', description: 'Experimental version with cutting-edge features.', isUncen: false },
    { id: 'provider-6/qwen-image', name: 'Qwen Image', description: 'Versatile model known for detailed and artistic outputs.', isUncen: false },
    { id: 'provider-6/sana-1.5', name: 'Sana 1.5', description: 'High-fidelity image generation, good for realistic imagery.', isUncen: false },
    { id: 'provider-1/FLUX.1-schnell', name: 'FLUX.1 Schnell', description: 'A fast and efficient model for quick image generation.', isUncen: false },
    { id: 'provider-6/sana-1.5-flash', name: 'Sana 1.5 Flash', description: 'Extremely fast generation with good quality for rapid prototyping.', isUncen: false },
    { id: 'provider-4/imagen-4', name: 'Imagen 4', description: 'Advanced Google model, excels in prompt understanding and high-quality results.', isUncen: false },
    { id: 'provider-4/imagen-3', name: 'Imagen 3', description: 'Previous version of Imagen, still provides strong performance.', isUncen: false }
];

// --- PAGE-SPECIFIC INITIALIZATION ---

function initImageGenerator() {
    const elements = {
        prompt: document.getElementById('imageGeneratorPromptInput'),
        size: document.getElementById('imageSize'),
        style: document.getElementById('imageStyle'),
        modelSelector: document.getElementById('imageModelSelector'),
        selectedModelText: document.getElementById('selectedImageModelText'),
        generateBtn: document.getElementById('generateImageButton'),
        resultImg: document.getElementById('generatedImage'),
        resultContainer: document.getElementById('generatedImageContainer'),
        downloadBtn: document.getElementById('generatedImageDownloadButton'),
        enhanceBtn: document.getElementById('enhanceImagePrompt'),
        clearBtn: document.getElementById('clearImagePromptBtn'),
        modal: document.getElementById('modelSelectionModal'),
        closeModalBtn: document.querySelector('#modelSelectionModal .close-modal-btn'),
        modelCardsContainer: document.getElementById('modelCardsContainer'),
        confirmModelBtn: document.getElementById('confirmModelSelection'),
    };
    elements.selectedModelText.textContent = imageModels.find(m => m.id === currentSelectedImageModel)?.name || currentSelectedImageModel;
    
    elements.generateBtn.addEventListener('click', async () => {
        playSound('tab_click');
        const prompt = elements.prompt.value.trim();
        if (!prompt) {
            displayStatusMessage('imageGeneratorStatus', 'error', 'Please enter a prompt.');
            playSound('error_buzz');
            return;
        }
        elements.generateBtn.classList.add('loading');
        elements.generateBtn.disabled = true;
        displayStatusMessage('imageGeneratorStatus', 'loading', 'Generating image...');
        try {
            const imageUrl = currentSelectedImageModel === 'uncen'
                ? await generateImageFromProxy(prompt)
                : (await clients.image.images.generate({
                    model: currentSelectedImageModel,
                    prompt: `${prompt}, in ${elements.style.value} style`,
                    size: elements.size.value,
                })).data[0].url;
            elements.resultImg.src = imageUrl;
            elements.resultContainer.style.display = 'block';
            displayStatusMessage('imageGeneratorStatus', 'success', 'Image generated successfully!');
        } catch (error) {
            displayStatusMessage('imageGeneratorStatus', 'error', `Error: ${error.message}`);
            playSound('error_buzz');
        } finally {
            elements.generateBtn.classList.remove('loading');
            elements.generateBtn.disabled = false;
        }
    });

    elements.downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = elements.resultImg.src;
        link.download = `neural-canvas-${Date.now()}.png`;
        link.click();
    });

    // Model selection modal logic
    let tempSelectedModelId = currentSelectedImageModel;
    elements.modelSelector.addEventListener('click', () => { playSound('tab_click'); elements.modal.style.display = 'flex'; populateModelModal(); });
    elements.closeModalBtn.addEventListener('click', () => { playSound('tab_click'); elements.modal.style.display = 'none'; });
    elements.confirmModelBtn.addEventListener('click', () => {
        playSound('tab_click');
        currentSelectedImageModel = tempSelectedModelId;
        elements.selectedModelText.textContent = imageModels.find(m => m.id === currentSelectedImageModel)?.name || currentSelectedImageModel;
        elements.modal.style.display = 'none';
    });

    function populateModelModal() {
        elements.modelCardsContainer.innerHTML = '';
        imageModels.forEach(model => {
            const card = document.createElement('div');
            card.className = 'model-card';
            card.dataset.modelId = model.id;
            if (model.id.includes('imagen')) card.classList.add('disabled-model-card');
            if (model.id === tempSelectedModelId) card.classList.add('selected');
            if (model.isUncen) card.classList.add('model-card-highlight');
            card.innerHTML = `<h4>${model.name}</h4><p>${model.description}</p>`;
            card.addEventListener('click', () => {
                if (card.classList.contains('disabled-model-card')) { playSound('error_buzz'); return; }
                document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                tempSelectedModelId = model.id;
            });
            elements.modelCardsContainer.appendChild(card);
        });
    }

    elements.enhanceBtn.addEventListener('click', createEnhancer('imageGeneratorPromptInput', 'imageGeneratorStatus'));
    elements.clearBtn.addEventListener('click', () => { playSound('tab_click'); elements.prompt.value = ''; elements.prompt.focus(); });
}

function initWebsiteBuilder() {
    const elements = {
        prompt: document.getElementById('builderPromptInput'),
        buildBtn: document.getElementById('buildWebsiteButton'),
        previewContainer: document.getElementById('websitePreviewContainer'),
        previewFrame: document.getElementById('websitePreview'),
        downloadBtn: document.getElementById('downloadCodeButton'),
        editBtn: document.getElementById('editCodeButton'),
        reEditBtn: document.getElementById('reEditWebsiteButton'),
        openNewTabBtn: document.getElementById('openInNewTabButton'),
        enhanceBtn: document.getElementById('enhanceBuilderPrompt'),
        clearBtn: document.getElementById('clearBuilderPromptBtn'),
        styleSelect: document.getElementById('builderStyle'),
        langSelect: document.getElementById('builderLanguage'),
    };

    elements.buildBtn.addEventListener('click', async () => {
        playSound('tab_click');
        const prompt = elements.prompt.value.trim();
        if (!prompt) {
            displayStatusMessage('builderStatus', 'error', 'Please enter a prompt.');
            playSound('error_buzz');
            return;
        }
        elements.buildBtn.classList.add('loading');
        elements.buildBtn.disabled = true;
        displayStatusMessage('builderStatus', 'loading', 'Building website...');
        try {
            const systemPrompt = `You are an expert web developer. Create a complete, self-contained HTML website based on the user's request. The response should be ONLY the HTML code, with no explanations or markdown. Include CSS in <style> tags and JavaScript in <script> tags. Style: ${elements.styleSelect.value}. Language: ${elements.langSelect.value}.`;
            const response = await clients.builder.chat.completions.create({
                model: "provider-6/gpt-4.1-mini",
                messages: [{ "role": "system", "content": systemPrompt }, { "role": "user", "content": `create a ${prompt} only code in html only` }],
            });
            const htmlCode = response.choices[0].message.content;
            currentWebsiteCode = htmlCode;
            currentWebsitePrompt = prompt;
            const blob = new Blob([htmlCode], { type: 'text/html' });
            elements.previewFrame.src = URL.createObjectURL(blob);
            elements.previewContainer.style.display = 'block';
            elements.reEditBtn.style.display = 'inline-flex';
            displayStatusMessage('builderStatus', 'success', 'Website built successfully!');
        } catch (error) {
            displayStatusMessage('builderStatus', 'error', `Error: ${error.message}`);
            playSound('error_buzz');
        } finally {
            elements.buildBtn.classList.remove('loading');
            elements.buildBtn.disabled = false;
        }
    });

    // Event listeners for other buttons (download, edit, etc.) would go here...
    elements.downloadBtn.addEventListener('click', () => {
        if(currentWebsiteCode) {
            const blob = new Blob([currentWebsiteCode], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'website.html';
            a.click();
            URL.revokeObjectURL(url);
        }
    });
    
    elements.openNewTabBtn.addEventListener('click', () => {
        if(currentWebsiteCode) {
            const blob = new Blob([currentWebsiteCode], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }
    });

    elements.enhanceBtn.addEventListener('click', createEnhancer('builderPromptInput', 'builderStatus'));
    elements.clearBtn.addEventListener('click', () => { playSound('tab_click'); elements.prompt.value = ''; elements.prompt.focus(); });
}

function initChatbot() {
    const elements = {
        input: document.getElementById('botInput'),
        sendBtn: document.getElementById('sendBotButton'),
        messages: document.getElementById('chatMessages'),
        upload: document.getElementById('chatImageUpload'),
        preview: document.getElementById('chatImagePreview'),
        previewContainer: document.getElementById('chatImagePreviewContainer'),
        removeImgBtn: document.getElementById('removeChatImageBtn'),
    };
    
    async function sendBotMessage() {
        playSound('tab_click');
        const text = elements.input.value.trim();
        if (!text && !selectedChatImage) return;
        
        let userMessageHTML = `<div class="message user-message"><div class="message-content"><div class="message-avatar">👤</div><div class="message-text">${text}</div>`;
        if (selectedChatImage) {
            userMessageHTML += `<img src="${URL.createObjectURL(selectedChatImage)}" class="message-image">`;
        }
        userMessageHTML += `</div></div>`;
        elements.messages.innerHTML += userMessageHTML;
        elements.messages.scrollTop = elements.messages.scrollHeight;

        elements.input.value = '';
        const imageFile = selectedChatImage;
        selectedChatImage = null;
        elements.previewContainer.style.display = 'none';

        elements.sendBtn.classList.add('loading');
        elements.sendBtn.disabled = true;
        
        try {
            const messages = [{ role: "system", content: "You are a helpful AI assistant." }];
            const userContent = [];
            if (text) userContent.push({ type: "text", text });
            if (imageFile) {
                const base64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(imageFile);
                });
                userContent.push({ type: "image_url", image_url: { url: base64 } });
            }
            messages.push({ role: "user", content: userContent });

            const response = await clients.bot.chat.completions.create({
                model: "provider-6/gemini-2.5-flash-thinking",
                messages,
            });
            const botResponse = response.choices[0].message.content;
            elements.messages.innerHTML += `<div class="message bot-message"><div class="message-content"><div class="message-avatar">🤖</div><div class="message-text">${botResponse}</div></div></div>`;
        } catch (error) {
            elements.messages.innerHTML += `<div class="message bot-message"><div class="message-content"><div class="message-avatar">🤖</div><div class="message-text">Sorry, an error occurred.</div></div></div>`;
            playSound('error_buzz');
        } finally {
            elements.sendBtn.classList.remove('loading');
            elements.sendBtn.disabled = false;
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }
    }

    elements.sendBtn.addEventListener('click', sendBotMessage);
    elements.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBotMessage(); } });
    
    elements.upload.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            selectedChatImage = file;
            elements.preview.src = URL.createObjectURL(file);
            elements.previewContainer.style.display = 'flex';
        }
    });
    elements.removeImgBtn.addEventListener('click', () => {
        selectedChatImage = null;
        elements.previewContainer.style.display = 'none';
        elements.upload.value = '';
    });
}

function initApiDocs() {
    document.querySelectorAll('.copy-code-btn').forEach(button => {
        button.addEventListener('click', () => {
            playSound('tab_click');
            const targetId = button.dataset.target;
            const code = document.getElementById(targetId).textContent;
            navigator.clipboard.writeText(code).then(() => {
                displayStatusMessage('globalAppStatus', 'success', 'Code copied!', 2000);
            }, () => {
                displayStatusMessage('globalAppStatus', 'error', 'Failed to copy.', 2000);
            });
        });
    });
}

// --- SHARED FUNCTIONALITY ---
function createEnhancer(promptElementId, statusElementId) {
    return async function() {
        playSound('tab_click');
        const promptElement = document.getElementById(promptElementId);
        const originalPrompt = promptElement.value.trim();
        if (!originalPrompt) {
            displayStatusMessage(statusElementId, 'error', 'Please enter a prompt to enhance.');
            playSound('error_buzz');
            return;
        }
        displayStatusMessage(statusElementId, 'loading', 'Enhancing prompt...');
        try {
            const response = await clients.enhancer.chat.completions.create({
                model: "provider-6/deepseek-r1-uncensored",
                messages: [{ role: "user", content: `Enhance this prompt for AI generation: "${originalPrompt}". Make it more detailed and creative. Return only the enhanced prompt.` }],
            });
            promptElement.value = response.choices[0].message.content;
            displayStatusMessage(statusElementId, 'success', 'Prompt enhanced!');
        } catch (error) {
            displayStatusMessage(statusElementId, 'error', `Enhancement failed: ${error.message}`);
            playSound('error_buzz');
        }
    };
}

function handleMobileMenu() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const nav = document.querySelector('.main-nav');
    if (menuBtn && nav) {
        menuBtn.addEventListener('click', () => {
            nav.classList.toggle('active');
        });
    }
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    // Load sounds
    try {
        await loadSound('error_buzz', 'error_buzz.mp3');
        await loadSound('tab_click', 'tab_click.mp3');
    } catch (error) {
        console.error('Failed to load sounds:', error);
    }
    
    // Shared components
    handleMobileMenu();

    // Page-specific initializations
    if (document.body.classList.contains('image-generator-page')) {
        initImageGenerator();
    }
    if (document.body.classList.contains('website-builder-page')) {
        initWebsiteBuilder();
    }
    if (document.body.classList.contains('chatbot-page')) {
        initChatbot();
    }
    if (document.body.classList.contains('api-docs-page')) {
        initApiDocs();
    }
});