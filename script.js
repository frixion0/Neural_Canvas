import { OpenAI } from 'https://cdn.skypack.dev/openai';

// --- GLOBAL VARIABLES & SETUP ---

let selectedFile = null;
let currentSelectedImageStyle = 'photorealistic';
let currentSelectedImageModel = 'img3'; // Default to img3 as requested
let currentWebsiteCode = '';
let currentWebsitePrompt = '';

const clients = {
    image: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
    builder: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
    enhancer: new OpenAI({ apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518', baseURL: "https://api.a4f.co/v1", dangerouslyAllowBrowser: true }),
};

// --- LOCAL STORAGE & HISTORY UTILITIES ---
const MAX_HISTORY_ITEMS = 12; // Store up to 12 recent items
function saveToHistory(key, newItem) {
    try {
        const history = JSON.parse(localStorage.getItem(key)) || [];
        history.unshift(newItem); // Add new item to the beginning
        if (history.length > MAX_HISTORY_ITEMS) {
            history.pop(); // Remove the oldest item if history exceeds max size
        }
        localStorage.setItem(key, JSON.stringify(history));
    } catch (error) {
        console.error("Failed to save to history:", error);
        // Handle potential storage full errors
        if (error.name === 'QuotaExceededError') {
             displayStatusMessage('globalAppStatus', 'error', 'Storage is full. Could not save to history.', 5000);
        }
    }
}

function loadFromHistory(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
        console.error("Failed to load history:", error);
        return [];
    }
}

function clearHistory(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error("Failed to clear history:", error);
    }
}

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

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- IMAGE GENERATION PROXY ---
async function generateImageFromProxy(model, promptText) {
    // This is the specific proxy endpoint used for img3, img4, uncen.
    const apiUrl = 'https://9000-firebase-studio-1754744124282.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/api/proxy';
    try {
        const response = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model, prompt: promptText }),
        });
        // If server returned non-OK, try to read any JSON/text error body for a clearer message
        if (!response.ok) {
            let bodyText = '';
            try {
                const contentType = response.headers.get('content-type') || '';
                bodyText = contentType.includes('application/json') ? JSON.stringify(await response.json()) : await response.text();
            } catch (parseErr) {
                bodyText = '<unable to parse error body>';
            }
            throw new Error(`Proxy Error ${response.status}: ${response.statusText} - ${bodyText}`);
        }
        const data = await response.json();
        // For 'uncen' return the full raw JSON so caller can show raw response as requested
        if (model === 'uncen') {
            return { raw: data };
        }
        return data.imageUrl;
    } catch (err) {
        // Network errors or other unexpected failures will be bubbled with their real message
        throw new Error(`Proxy request failed: ${err.message}`);
    }
}

// --- DATA ---
const imageModels = [
    { id: 'img3', name: 'Imagen 3 (Google)', description: 'Advanced model for high-quality, photorealistic results. Uses proxy.', isUncen: false },
    { id: 'img4', name: 'Imagen 4 (Google)', description: 'Next generation of Imagen, even better quality. Uses proxy.', isUncen: false },
    { id: 'uncen', name: 'Uncensored', description: 'Generates images without content restrictions (use responsibly). Uses proxy.', isUncen: true },
    { id: 'provider-2/FLUX.1-schnell-v2', name: 'FLUX.1 Schnell v2', description: 'Optimized for speed and quality, excellent for general use.', isUncen: false },
    { id: 'provider-3/FLUX.1-dev', name: 'FLUX.1 Dev', description: 'Experimental version with cutting-edge features.', isUncen: false },
    { id: 'provider-6/qwen-image', name: 'Qwen Image', description: 'Versatile model known for detailed and artistic outputs.', isUncen: false },
    { id: 'provider-6/sana-1.5', name: 'Sana 1.5', description: 'High-fidelity image generation, good for realistic imagery.', isUncen: false },
    { id: 'provider-1/FLUX.1-schnell', name: 'FLUX.1 Schnell', description: 'A fast and efficient model for quick image generation.', isUncen: false },
    { id: 'provider-6/sana-1.5-flash', name: 'Sana 1.5 Flash', description: 'Extremely fast generation with good quality for rapid prototyping.', isUncen: false }
];

// --- PAGE-SPECIFIC INITIALIZATION ---

function initImageGenerator() {
    const historyKey = 'imageHistory';
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
        openNewTabBtn: document.getElementById('openImageInNewTabButton'),
        enhanceBtn: document.getElementById('enhanceImagePrompt'),
        clearBtn: document.getElementById('clearImagePromptBtn'),
        modal: document.getElementById('modelSelectionModal'),
        closeModalBtn: document.querySelector('#modelSelectionModal .close-modal-btn'),
        modelCardsContainer: document.getElementById('modelCardsContainer'),
        confirmModelBtn: document.getElementById('confirmModelSelection'),
        showHistoryBtn: document.getElementById('showImageHistoryBtn'),
        historyModal: document.getElementById('imageHistoryModal'),
        closeHistoryModalBtn: document.querySelector('#imageHistoryModal .close-modal-btn'),
        historyGridModal: document.getElementById('imageHistoryGridModal'),
        clearHistoryModalBtn: document.getElementById('clearImageHistoryModalBtn'),
        imageViewerModal: document.getElementById('imageViewerModal'),
        closeImageViewerBtn: document.querySelector('#imageViewerModal .close-modal-btn'),
        imageViewerImg: document.getElementById('imageViewerImg'),
    };
    
    // Set default model to img3
    currentSelectedImageModel = 'img3';
    elements.selectedModelText.textContent = imageModels.find(m => m.id === currentSelectedImageModel)?.name || currentSelectedImageModel;
    
    function renderImageHistory() {
        const history = loadFromHistory(historyKey);
        const grid = elements.historyGridModal;
        grid.innerHTML = '';
        if (history.length > 0) {
            history.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `<img src="${item.imageUrl}" alt="Generated image from history" title="${item.prompt}">`;
                historyItem.addEventListener('click', () => {
                    playSound('tab_click');
                    elements.resultImg.src = item.imageUrl;
                    elements.prompt.value = item.prompt;
                    elements.resultContainer.style.display = 'block';
                    elements.historyModal.style.display = 'none'; // Close modal on selection
                    // Dynamically add the "Edit with AI" button if not already present
                    addEditWithAIButton(item.imageUrl);
                    elements.resultContainer.scrollIntoView({ behavior: 'smooth' });
                });
                grid.appendChild(historyItem);
            });
        } else {
             grid.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">Your image generation history is empty.</p>`;
        }
    }

    // Helper to add "Edit with AI" button
    function addEditWithAIButton(imageUrl) {
        const actionButtonsDiv = document.querySelector('#generatedImageContainer .action-buttons');
        let editImageBtn = actionButtonsDiv.querySelector('.edit-generated-btn');
        if (!editImageBtn) {
            editImageBtn = document.createElement('button');
            editImageBtn.className = 'action-btn edit-generated-btn';
            editImageBtn.textContent = 'Edit with AI';
            actionButtonsDiv.appendChild(editImageBtn);
        }
        // Always update the event listener to ensure it uses the latest image URL
        editImageBtn.onclick = () => {
            playSound('tab_click');
            window.location.href = '/image-edit9r.html?image=' + encodeURIComponent(imageUrl);
        };
    }

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
            const proxyModels = ['uncen', 'img3', 'img4'];
            let tempImageUrl;

            if (proxyModels.includes(currentSelectedImageModel)) {
                 const proxyResult = await generateImageFromProxy(currentSelectedImageModel, prompt);
                 if (currentSelectedImageModel === 'uncen') {
                     console.log('UNCEN raw response:', proxyResult.raw);
                     displayStatusMessage('imageGeneratorStatus', 'success', `UNCEN raw response: ${JSON.stringify(proxyResult.raw).slice(0,1200)}`, 10000);
                     tempImageUrl = (proxyResult.raw && (proxyResult.raw.imageUrl || proxyResult.raw.url)) || '';
                     if (!tempImageUrl) {
                         elements.generateBtn.classList.remove('loading');
                         elements.generateBtn.disabled = false;
                         playSound('error_buzz');
                         throw new Error('UNCEN response did not include an imageUrl. See console for raw response.');
                     }
                 } else {
                     tempImageUrl = (typeof proxyResult === 'string') ? proxyResult : (proxyResult.imageUrl || proxyResult.url || '');
                     if (!tempImageUrl) throw new Error('Proxy did not return a valid image URL.');
                 }
            } else {
                 tempImageUrl = (await clients.image.images.generate({
                    model: currentSelectedImageModel,
                    prompt: `${prompt}, in ${elements.style.value} style`,
                    // size is not supported by all models, so we'll only send it for non-proxy models for now
                    // size: elements.size.value, 
                })).data[0].url;
            }
            
            let permanentImageUrl = '';
            displayStatusMessage('imageGeneratorStatus', 'loading', 'Processing image...');
            try {
                const imageResponse = await fetch(tempImageUrl);
                if (!imageResponse.ok) throw new Error(`Image fetch failed with status ${imageResponse.status}`);
                const imageBlob = await imageResponse.blob();
                permanentImageUrl = await blobToBase64(imageBlob);
            } catch (fetchErr) {
                console.warn('Failed to fetch/convert image blob, falling back to original URL (may be temporary):', fetchErr);
                permanentImageUrl = tempImageUrl;
                displayStatusMessage('imageGeneratorStatus', 'success', 'Image generated, displayed via direct URL (fallback).');
            }

            elements.resultImg.src = permanentImageUrl;
            elements.resultContainer.style.display = 'block';
            displayStatusMessage('imageGeneratorStatus', 'success', 'Image generated successfully!');
            
            const historyItem = { prompt: prompt, imageUrl: permanentImageUrl, timestamp: new Date().toISOString() };
            saveToHistory(historyKey, historyItem);
            
            addEditWithAIButton(permanentImageUrl);
            
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

    elements.openNewTabBtn.addEventListener('click', () => {
        if (elements.resultImg.src) {
            playSound('tab_click');
            elements.imageViewerImg.src = elements.resultImg.src;
            elements.imageViewerModal.style.display = 'flex';
        }
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
            if (model.id === tempSelectedModelId) card.classList.add('selected');
            if (model.isUncen) card.classList.add('model-card-highlight');
            card.innerHTML = `<h4>${model.name}</h4><p>${model.description}</p>`;
            card.addEventListener('click', () => {
                // Removed disabled-model-card class as per previous iteration; re-add if needed
                document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                tempSelectedModelId = model.id;
            });
            elements.modelCardsContainer.appendChild(card);
        });
    }

    // History Modal Logic
    elements.showHistoryBtn.addEventListener('click', () => {
        playSound('tab_click');
        renderImageHistory(); // Re-render every time it's opened
        elements.historyModal.style.display = 'flex';
    });

    elements.closeHistoryModalBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.historyModal.style.display = 'none';
    });

    elements.clearHistoryModalBtn.addEventListener('click', () => {
        playSound('tab_click');
        clearHistory(historyKey);
        renderImageHistory(); // Re-render to show it's empty
        displayStatusMessage('globalAppStatus', 'success', 'History cleared!', 2000);
    });

    // Image viewer modal logic
    elements.closeImageViewerBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.imageViewerModal.style.display = 'none';
        elements.imageViewerImg.src = ''; // Clear image src
    });

    elements.enhanceBtn.addEventListener('click', createEnhancer('imageGeneratorPromptInput', 'imageGeneratorStatus'));
    elements.clearBtn.addEventListener('click', () => { playSound('tab_click'); elements.prompt.value = ''; elements.prompt.focus(); });
    
    // Initial render of history on page load is no longer needed as it's in a modal
}

function initWebsiteBuilder() {
    const historyKey = 'websiteHistory';
    const elements = {
        prompt: document.getElementById('builderPromptInput'),
        buildBtn: document.getElementById('buildWebsiteButton'),
        previewContainer: document.getElementById('websitePreviewContainer'),
        previewFrame: document.getElementById('websitePreview'),
        downloadBtn: document.getElementById('downloadCodeButton'),
        editBtn: document.getElementById('editCodeButton'),
        changeBtn: document.getElementById('changeWithAiButton'),
        reEditBtn: document.getElementById('reEditWebsiteButton'),
        openNewTabBtn: document.getElementById('openInNewTabButton'),
        enhanceBtn: document.getElementById('enhanceBuilderPrompt'),
        clearBtn: document.getElementById('clearBuilderPromptBtn'),
        styleSelect: document.getElementById('builderStyle'),
        langSelect: document.getElementById('builderLanguage'),
        modelSelect: document.getElementById('builderModel'),
        // Preview controls
        previewDesktopBtn: document.getElementById('previewDesktop'),
        previewTabletBtn: document.getElementById('previewTablet'),
        previewMobileBtn: document.getElementById('previewMobile'),
        // Code editor modal
        codeEditorModal: document.getElementById('codeEditorModal'),
        codeEditorTextarea: document.getElementById('codeEditorTextarea'),
        updatePreviewButton: document.getElementById('updatePreviewButton'),
        closeCodeEditorBtn: document.getElementById('closeCodeEditorBtn'),
        // AI Change modal
        changePromptModal: document.getElementById('changePromptModal'),
        closeChangePromptBtn: document.getElementById('closeChangePromptBtn'),
        changePromptTextarea: document.getElementById('changePromptTextarea'),
        submitChangeButton: document.getElementById('submitChangeButton'),
        // New projects modal elements
        showProjectsBtn: document.getElementById('showWebsiteProjectsBtn'),
        projectsModal: document.getElementById('websiteProjectsModal'),
        closeProjectsModalBtn: document.querySelector('#websiteProjectsModal .close-modal-btn'),
        projectsListModal: document.getElementById('websiteProjectsListModal'),
        clearProjectsModalBtn: document.getElementById('clearWebsiteProjectsModalBtn'),
    };

    function renderWebsiteHistory() {
        const history = loadFromHistory(historyKey);
        const list = elements.projectsListModal;
        list.innerHTML = '';
        if (history.length > 0) {
            history.forEach((item, index) => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item-website';
                historyItem.innerHTML = `
                    <p class="history-prompt">"${item.prompt.substring(0, 100)}${item.prompt.length > 100 ? '...' : ''}"</p>
                    <div class="history-actions">
                        <button class="history-btn load-btn" data-index="${index}">Load</button>
                        <button class="history-btn open-btn" data-index="${index}">Open</button>
                    </div>
                `;
                list.appendChild(historyItem);
            });

            list.querySelectorAll('.load-btn').forEach(btn => btn.addEventListener('click', (e) => {
                playSound('tab_click');
                const item = history[e.target.dataset.index];
                currentWebsiteCode = item.code;
                currentWebsitePrompt = item.prompt;
                const blob = new Blob([currentWebsiteCode], { type: 'text/html' });
                elements.previewFrame.src = URL.createObjectURL(blob);
                elements.prompt.value = currentWebsitePrompt;
                elements.previewContainer.style.display = 'block';
                elements.reEditBtn.style.display = 'inline-flex';
                elements.projectsModal.style.display = 'none'; // Close modal on selection
                elements.previewContainer.scrollIntoView({ behavior: 'smooth' });
            }));
            list.querySelectorAll('.open-btn').forEach(btn => btn.addEventListener('click', (e) => {
                 playSound('tab_click');
                const item = history[e.target.dataset.index];
                const blob = new Blob([item.code], {type: 'text/html'});
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            }));
        } else {
             list.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">You have no saved projects.</p>`;
        }
    }

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
                model: elements.modelSelect.value,
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

            // Save to history
            const historyItem = { prompt: currentWebsitePrompt, code: currentWebsiteCode, timestamp: new Date().toISOString() };
            saveToHistory(historyKey, historyItem);
            // No need to render history here

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
            playSound('tab_click');
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
            playSound('tab_click');
            const blob = new Blob([currentWebsiteCode], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }
    });

    elements.reEditBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.prompt.value = currentWebsitePrompt;
        elements.prompt.focus();
        // Scroll to the top of the tool wrapper
        document.getElementById('builderSection').scrollIntoView({ behavior: 'smooth' });
    });

    elements.editBtn.addEventListener('click', () => {
        if (currentWebsiteCode) {
            playSound('tab_click');
            elements.codeEditorTextarea.value = currentWebsiteCode;
            elements.codeEditorModal.style.display = 'flex';
        }
    });
    
    elements.closeCodeEditorBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.codeEditorModal.style.display = 'none';
    });
    
    elements.updatePreviewButton.addEventListener('click', () => {
        playSound('tab_click');
        currentWebsiteCode = elements.codeEditorTextarea.value;
        const blob = new Blob([currentWebsiteCode], { type: 'text/html' });
        elements.previewFrame.src = URL.createObjectURL(blob);
        elements.codeEditorModal.style.display = 'none';
        displayStatusMessage('builderStatus', 'success', 'Preview updated!');
    });

    // AI Change Modal Logic
    elements.changeBtn.addEventListener('click', () => {
        if (currentWebsiteCode) {
            playSound('tab_click');
            elements.changePromptTextarea.value = ''; // Clear previous prompt
            elements.changePromptModal.style.display = 'flex';
        } else {
            playSound('error_buzz');
            displayStatusMessage('builderStatus', 'error', 'Please generate a website first before trying to change it.');
        }
    });

    elements.closeChangePromptBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.changePromptModal.style.display = 'none';
    });

    elements.submitChangeButton.addEventListener('click', async () => {
        playSound('tab_click');
        const changePrompt = elements.changePromptTextarea.value.trim();
        if (!changePrompt) {
            displayStatusMessage('globalAppStatus', 'error', 'Please describe the changes you want to make.');
            playSound('error_buzz');
            return;
        }

        elements.submitChangeButton.classList.add('loading');
        elements.submitChangeButton.disabled = true;
        displayStatusMessage('builderStatus', 'loading', 'Applying changes with AI...');
        
        try {
            const systemPrompt = `You are an expert web developer. The user wants to modify the following HTML code.
Here is the current code:
\`\`\`html
${currentWebsiteCode}
\`\`\`
Here is the requested change: "${changePrompt}".
Please provide the complete, updated HTML code. The response should be ONLY the HTML code, with no explanations or markdown. Ensure all styles are in <style> tags and scripts are in <script> tags within the single HTML file.`;

            const response = await clients.builder.chat.completions.create({
                model: elements.modelSelect.value, // Use the currently selected model
                messages: [{ "role": "system", "content": systemPrompt }, { "role": "user", "content": changePrompt }],
            });

            const newHtmlCode = response.choices[0].message.content;
            currentWebsiteCode = newHtmlCode;
            const blob = new Blob([newHtmlCode], { type: 'text/html' });
            elements.previewFrame.src = URL.createObjectURL(blob);
            
            elements.changePromptModal.style.display = 'none';
            displayStatusMessage('builderStatus', 'success', 'Website updated successfully!');

            // Update history with the changed version
            const historyItem = { prompt: `Changed: ${changePrompt}`, code: currentWebsiteCode, timestamp: new Date().toISOString() };
            saveToHistory(historyKey, historyItem);
            // No need to render history here

        } catch (error) {
            displayStatusMessage('builderStatus', 'error', `Error applying changes: ${error.message}`);
            playSound('error_buzz');
        } finally {
            elements.submitChangeButton.classList.remove('loading');
            elements.submitChangeButton.disabled = false;
        }
    });

    function setPreviewDevice(device) {
        playSound('tab_click');
        elements.previewFrame.className = device;
        [elements.previewDesktopBtn, elements.previewTabletBtn, elements.previewMobileBtn].forEach(btn => btn.classList.remove('active'));
        if (device === 'mobile') elements.previewMobileBtn.classList.add('active');
        else if (device === 'tablet') elements.previewTabletBtn.classList.add('active');
        else elements.previewDesktopBtn.classList.add('active');
    }
    elements.previewDesktopBtn.addEventListener('click', () => setPreviewDevice(''));
    elements.previewMobileBtn.addEventListener('click', () => setPreviewDevice('mobile'));
    elements.previewTabletBtn.addEventListener('click', () => setPreviewDevice('tablet'));

    // Projects Modal Logic
    elements.showProjectsBtn.addEventListener('click', () => {
        playSound('tab_click');
        renderWebsiteHistory(); // Re-render every time it's opened
        elements.projectsModal.style.display = 'flex';
    });

    elements.closeProjectsModalBtn.addEventListener('click', () => {
        playSound('tab_click');
        elements.projectsModal.style.display = 'none';
    });

    elements.clearProjectsModalBtn.addEventListener('click', () => {
        playSound('tab_click');
        clearHistory(historyKey);
        renderWebsiteHistory(); // Re-render to show it's empty
        displayStatusMessage('globalAppStatus', 'success', 'Projects cleared!', 2000);
    });

    elements.enhanceBtn.addEventListener('click', createEnhancer('builderPromptInput', 'builderStatus'));
    elements.clearBtn.addEventListener('click', () => { playSound('tab_click'); elements.prompt.value = ''; elements.prompt.focus(); });
    
    // Initial render of history on page load is no longer needed
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

function initImageEditor() {
    const elements = {
        upload: document.getElementById('imageUpload'),
        dropZone: document.getElementById('imageDropZone'),
        preview: document.getElementById('imagePreview'),
        previewContainer: document.getElementById('imagePreviewContainer'),
        removeBtn: document.getElementById('removeImageBtn'),
        prompt: document.getElementById('editorPromptInput'),
        editBtn: document.getElementById('editImageButton'),
        result: document.getElementById('editedImage'),
        resultContainer: document.getElementById('editedImageContainer'),
        downloadBtn: document.getElementById('downloadEditedImageButton'),
        editAgainBtn: document.getElementById('editAgainButton'),
        enhanceBtn: document.getElementById('enhanceImageEditPrompt'),
        clearBtn: document.getElementById('clearImageEditPromptBtn'),
        editorControls: document.getElementById('editorControls'), // Get editor controls div
    };

    let currentImageBase64 = null;

    // Check for generated image from image generator
    const urlParams = new URLSearchParams(window.location.search);
    const generatedImageUrl = urlParams.get('image');
    if (generatedImageUrl) {
        currentImageBase64 = decodeURIComponent(generatedImageUrl); // Decode the URL component
        elements.preview.src = currentImageBase64;
        elements.previewContainer.style.display = 'block';
        elements.dropZone.style.display = 'none';
        elements.editorControls.style.display = 'block'; // Show controls
        displayStatusMessage('imageEditorStatus', 'success', 'Image loaded from generator!');
    }

    // File upload handlers
    elements.dropZone?.addEventListener('click', () => {
        playSound('tab_click');
        elements.upload?.click();
    });
    
    elements.upload?.addEventListener('change', handleImageSelect);
    
    // Drag and drop
    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropZone?.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropZone?.classList.add('dragover');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropZone?.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropZone?.classList.remove('dragover');
        });
    });
    
    elements.dropZone?.addEventListener('drop', (e) => {
        playSound('tab_click');
        e.preventDefault();
        e.stopPropagation();
        elements.dropZone?.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processImageFile(files[0]);
        }
    });

    function handleImageSelect(e) {
        playSound('tab_click');
        const file = e.target.files[0];
        if (file) {
            processImageFile(file);
        }
    }

    function processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            displayStatusMessage('imageEditorStatus', 'error', 'Please select a valid image file.');
            playSound('error_buzz');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // Max 10MB
            displayStatusMessage('imageEditorStatus', 'error', 'Image file is too large. Please select an image under 10MB.');
            playSound('error_buzz');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageBase64 = e.target.result;
            elements.preview.src = currentImageBase64;
            elements.previewContainer.style.display = 'block';
            elements.dropZone.style.display = 'none';
            elements.editorControls.style.display = 'block';
            displayStatusMessage('imageEditorStatus', 'success', 'Image uploaded successfully!');
        };
        reader.onerror = () => {
            displayStatusMessage('imageEditorStatus', 'error', 'Failed to read image file.');
            playSound('error_buzz');
        };
        reader.readAsDataURL(file);
    }

    elements.removeBtn?.addEventListener('click', () => {
        playSound('tab_click');
        currentImageBase64 = null;
        elements.previewContainer.style.display = 'none';
        elements.dropZone.style.display = 'block';
        elements.upload.value = ''; // Clear file input
        elements.resultContainer.style.display = 'none'; // Hide result if any
        elements.editorControls.style.display = 'none'; // Hide controls
        elements.prompt.value = ''; // Clear prompt input
        clearStatusMessage('imageEditorStatus'); // Clear status
    });

    // Preset filters
    document.querySelectorAll('[data-instruction]').forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('tab_click');
            elements.prompt.value = btn.dataset.instruction;
            elements.prompt.focus();
        });
    });

    elements.editBtn?.addEventListener('click', async () => {
        playSound('tab_click');
        if (!currentImageBase64) {
            displayStatusMessage('imageEditorStatus', 'error', 'Please upload an image first.');
            playSound('error_buzz');
            return;
        }

        const instructions = elements.prompt.value.trim();
        if (!instructions) {
            displayStatusMessage('imageEditorStatus', 'error', 'Please enter edit instructions.');
            playSound('error_buzz');
            return;
        }

        elements.editBtn.classList.add('loading');
        elements.editBtn.disabled = true;
        displayStatusMessage('imageEditorStatus', 'loading', 'Applying AI edits...');

        try {
            // This is the specific manipulation endpoint
            const response = await fetch('https://ai-image-editor-eta.vercel.app/api/manipulate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    photoDataUri: currentImageBase64,
                    instructions: instructions
                }),
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Image editing failed');
            }
            if (!data.editedPhotoDataUri) {
                throw new Error('No edited image data received from API.');
            }

            elements.result.src = data.editedPhotoDataUri;
            elements.resultContainer.style.display = 'block';
            displayStatusMessage('imageEditorStatus', 'success', 'Image edited successfully!');
            elements.resultContainer.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error("Image editing error:", error);
            displayStatusMessage('imageEditorStatus', 'error', `Error: ${error.message}`);
            playSound('error_buzz');
        } finally {
            elements.editBtn.classList.remove('loading');
            elements.editBtn.disabled = false;
        }
    });

    elements.downloadBtn?.addEventListener('click', () => {
        if (elements.result.src) {
            playSound('tab_click');
            const link = document.createElement('a');
            link.href = elements.result.src;
            link.download = `edited-image-${Date.now()}.png`;
            link.click();
        }
    });

    elements.editAgainBtn?.addEventListener('click', () => {
        playSound('tab_click');
        if (elements.result.src) {
            currentImageBase64 = elements.result.src; // Set the edited image as the new base
            elements.preview.src = currentImageBase64; // Update the preview image
            elements.previewContainer.style.display = 'block'; // Make sure the preview container is visible
            elements.resultContainer.style.display = 'none'; // Hide the result container
            elements.prompt.value = ''; // Clear the prompt for new instructions
            elements.prompt.focus(); // Focus the prompt
            displayStatusMessage('imageEditorStatus', 'success', 'Previous edit loaded for further changes.');
        } else {
            displayStatusMessage('imageEditorStatus', 'error', 'No edited image to load for further edits.');
            playSound('error_buzz');
        }
    });

    if (elements.enhanceBtn) {
        elements.enhanceBtn.addEventListener('click', createEnhancer('editorPromptInput', 'imageEditorStatus'));
    }
    
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', () => {
            playSound('tab_click');
            elements.prompt.value = '';
            elements.prompt.focus();
        });
    }
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
                model: "provider-6/gpt-4.1-mini",
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
            menuBtn.classList.toggle('active'); // Toggle class for hamburger animation
        });
        // Close menu if a nav link is clicked (for single page behavior or navigating)
        nav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuBtn.classList.remove('active');
            });
        });
    }
}

// Enhanced CSS for better upload experience
const additionalStyles = `
<style>
.upload-zone.dragover {
    background: rgba(0, 224, 255, 0.1);
    border-color: var(--neon-cyan);
    transform: scale(1.02);
}

.upload-zone {
    transition: all 0.3s ease;
}

.upload-zone:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.5);
}

#imagePreview {
    max-width: 100%;
    max-height: 400px;
    border-radius: var(--border-radius-sm);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.preset-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
}

.preset-filters button {
    font-size: 0.9rem;
    padding: 12px 16px;
}

@media (max-width: 768px) {
    .preset-filters {
        grid-template-columns: repeat(2, 1fr);
    }
}
</style>
`;

// Add the additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

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
    if (document.body.classList.contains('api-docs-page')) {
        initApiDocs();
    }
    if (document.body.classList.contains('image-edit9r-page')) {
        initImageEditor();
    }
});