import { OpenAI } from 'https://cdn.skypack.dev/openai';

// Global variables and setup
let selectedFile = null; // For image editor - Keep for potential image generation edits if re-introduced
let selectedChatImage = null; // For chatbot image
let currentTab = 'imageGenerator'; // Set default tab to imageGenerator
let currentSelectedImageStyle = 'photorealistic'; // New: Default selected image style
let currentSelectedImageModel = 'provider-2/FLUX.1-schnell-v2'; // New: Default selected image model
let currentWebsiteCode = ''; // Store generated website code for re-editing
let currentWebsitePrompt = ''; // Store the original prompt for context or future re-editing logic

// OpenAI clients
const imageGenerateClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1",
    dangerouslyAllowBrowser: true,
});

// Add missing builderClient
const builderClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1",
    dangerouslyAllowBrowser: true,
});

// Add new client for bot
const botClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1",
    dangerouslyAllowBrowser: true,
});

// Add new client for prompt enhancer
const promptEnhancerClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1",
    dangerouslyAllowBrowser: true,
});

// New proxy function for uncensored image generation
async function generateImageFromProxy(promptText) {
    // The URL of your deployed application
    const apiUrl = 'https://9000-firebase-studio-1754744124282.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev/api/proxy';

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'uncen',
            prompt: promptText, // Use the dynamic promptText
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`); // Use errorData.error as per new example
    }

    const data = await response.json();
    const imageUrl = data.imageUrl; // Changed from data.data[0].url to data.imageUrl as per new example
    
    return imageUrl;
}

// Add new elements to the elements object
const elements = {
    imageGeneratorPromptInput: document.getElementById('imageGeneratorPromptInput'),
    imageSize: document.getElementById('imageSize'),
    imageStyle: document.getElementById('imageStyle'), // NEW: References the select element for styles
    imageModel: document.getElementById('imageModel'),   // NEW: References the select element for models
    generateImageButton: document.getElementById('generateImageButton'),
    generatedImage: document.getElementById('generatedImage'),
    generatedImageContainer: document.getElementById('generatedImageContainer'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('errorMessage'),
    generatedImageDownloadButton: document.getElementById('generatedImageDownloadButton'),
    // New status message elements
    imageGeneratorStatus: document.getElementById('imageGeneratorStatus'),
    // globalAppStatus will be used for general app messages like download errors or image loading for editor
    builderPromptInput: document.getElementById('builderPromptInput'),
    builderLanguage: document.getElementById('builderLanguage'),
    builderStyle: document.getElementById('builderStyle'),
    buildWebsiteButton: document.getElementById('buildWebsiteButton'),
    websitePreviewContainer: document.getElementById('websitePreviewContainer'),
    websitePreview: document.getElementById('websitePreview'),
    downloadCodeButton: document.getElementById('downloadCodeButton'),
    editCodeButton: document.getElementById('editCodeButton'),
    builderStatus: document.getElementById('builderStatus'),
    botInput: document.getElementById('botInput'),
    sendBotButton: document.getElementById('sendBotButton'),
    chatMessages: document.getElementById('chatMessages'),
    botStatus: document.getElementById('botStatus'),
    // New elements for chatbot image upload
    chatImageUpload: document.getElementById('chatImageUpload'),
    chatImagePreview: document.getElementById('chatImagePreview'),
    chatImagePreviewContainer: document.getElementById('chatImagePreviewContainer'),
    removeChatImageBtn: document.getElementById('removeChatImageBtn'),
    // New elements for prompt enhancement
    enhanceImagePrompt: document.getElementById('enhanceImagePrompt'),
    enhanceBuilderPrompt: document.getElementById('enhanceBuilderPrompt'),
    // New element for opening website in new tab
    openInNewTabButton: document.getElementById('openInNewTabButton'),
    // New element for re-editing website
    reEditWebsiteButton: document.getElementById('reEditWebsiteButton'),
    // New elements for API section
    apiImageCodeExample: document.getElementById('apiImageCodeExample'),
    copyCodeButtons: document.querySelectorAll('.copy-code-btn'),
};

// Utility function for local status messages
function displayStatusMessage(elementId, type, message, duration = 3000) {
    const statusDiv = document.getElementById(elementId);
    if (!statusDiv) {
        console.error(`Status element with ID '${elementId}' not found.`);
        return;
    }

    statusDiv.textContent = message;
    statusDiv.className = `generator-status-message ${type}`;
    statusDiv.style.display = 'block';

    // Hide messages after a duration, unless it's a 'loading' message
    if (type !== 'loading') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
            statusDiv.className = 'generator-status-message'; // Reset class
        }, duration);
    }
}

// Function to clear status message
function clearStatusMessage(elementId) {
    const statusDiv = document.getElementById(elementId);
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = 'generator-status-message';
    }
}

// Utility function for reliable downloads
async function downloadMedia(mediaUrl, filename) {
    // Display a loading message for downloads (globally or relevant section)
    // For downloads, global status is appropriate since it affects the browser's download manager.
    displayStatusMessage('globalAppStatus', 'loading', 'Preparing download...');

    try {
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error(`Network response was not ok. Status: ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link); // Append to body to ensure it's in the DOM
        link.click();
        document.body.removeChild(link); // Clean up
        URL.revokeObjectURL(url); // Release the object URL
        displayStatusMessage('globalAppStatus', 'success', 'Download initiated successfully!', 3000);
    } catch (error) {
        console.error('Download failed:', error);
        displayStatusMessage('globalAppStatus', 'error', `Failed to download file: ${error.message}`, 5000);
    }
}

// Update tab switching to include bot and api
const originalTabButtons = document.querySelectorAll('.tab-btn');
const tabs = ['imageGenerator', 'builder', 'bot', 'api']; // Updated tabs array
originalTabButtons.forEach((btn, index) => {
    if (index < tabs.length) {
        btn.addEventListener('click', () => {
            switchTab(tabs[index]);
            // Clear any lingering status messages when switching tabs
            clearStatusMessage('imageGeneratorStatus');
            clearStatusMessage('builderStatus');
            clearStatusMessage('botStatus');
            // Clear globalAppStatus as well, as it might relate to a previous action
            clearStatusMessage('globalAppStatus');
        });
    }
});

// Update switchTab function to handle remaining tabs
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update active states
    originalTabButtons.forEach((btn, index) => {
        btn.classList.toggle('active', tabs[index] === tabName);
    });
    
    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Section`).classList.add('active');
}

// Image style selection functionality (now using select element)
elements.imageStyle.addEventListener('change', (event) => {
    currentSelectedImageStyle = event.target.value; // Update global variable
});

// Image model selection functionality (now using select element)
elements.imageModel.addEventListener('change', (event) => {
    currentSelectedImageModel = event.target.value; // Update global variable
});

// Image generation functionality
elements.generateImageButton.addEventListener('click', async () => {
    const prompt = elements.imageGeneratorPromptInput.value.trim();
    if (!prompt) {
        displayStatusMessage('imageGeneratorStatus', 'error', 'Please enter a prompt for image generation.');
        return;
    }

    elements.generateImageButton.classList.add('loading');
    elements.generateImageButton.disabled = true;
    elements.imageGeneratorPromptInput.disabled = true;
    elements.imageSize.disabled = true;
    // Disable style and model select elements
    elements.imageStyle.disabled = true;
    elements.imageModel.disabled = true;
    
    elements.generatedImageContainer.style.display = 'none';
    displayStatusMessage('imageGeneratorStatus', 'loading', 'Generating image with AI...');

    try {
        let imageUrl;
        if (currentSelectedImageModel === 'uncen') { // Use currentSelectedImageModel
            // Use the proxy for the 'uncen' model
            imageUrl = await generateImageFromProxy(prompt);
        } else {
            // Use the OpenAI client for other models/styles
            const response = await imageGenerateClient.images.generate({
                model: currentSelectedImageModel, // Use the selected model
                prompt: `${prompt}, in ${currentSelectedImageStyle} style`, // Combine prompt and style
                n: 1,
                size: elements.imageSize.value,
            });
            imageUrl = response.data[0].url;
        }

        elements.generatedImage.src = imageUrl;
        elements.generatedImageContainer.style.display = 'block';
        displayStatusMessage('imageGeneratorStatus', 'success', 'Image generated successfully!');
        
        // Remove existing "Edit this image" button if any
        const existingEditButton = elements.generatedImageContainer.querySelector('.edit-generated-btn');
        if (existingEditButton) {
            existingEditButton.remove();
        }
        
    } catch (error) {
        displayStatusMessage('imageGeneratorStatus', 'error', `Error: ${error.message}`);
    } finally {
        elements.generateImageButton.classList.remove('loading');
        elements.generateImageButton.disabled = false;
        elements.imageGeneratorPromptInput.disabled = false;
        elements.imageSize.disabled = false;
        // Re-enable style and model select elements
        elements.imageStyle.disabled = false;
        elements.imageModel.disabled = false;
    }
});

// Website builder functionality
elements.buildWebsiteButton.addEventListener('click', async () => {
    const prompt = elements.builderPromptInput.value.trim();
    if (!prompt) {
        displayStatusMessage('builderStatus', 'error', 'Please enter a prompt for website generation.');
        return;
    }

    elements.buildWebsiteButton.classList.add('loading');
    elements.buildWebsiteButton.disabled = true;
    elements.builderPromptInput.disabled = true;
    elements.builderLanguage.disabled = true;
    elements.builderStyle.disabled = true;
    elements.websitePreviewContainer.style.display = 'none';
    elements.reEditWebsiteButton.style.display = 'none'; // Hide re-edit button during new generation
    displayStatusMessage('builderStatus', 'loading', 'Building website with AI...');

    try {
        const systemPrompt = `You are an expert web developer. Create a complete, self-contained HTML website based on the user's request. The response should be ONLY the HTML code, with no explanations or markdown. Include CSS in <style> tags and JavaScript in <script> tags. Make it modern, responsive, and visually appealing. Style: ${elements.builderStyle.value}. Language: ${elements.builderLanguage.value}.`;
        
        const controller = new AbortController();
        // 15-second timeout instead of hanging forever
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await builderClient.chat.completions.create({
            model: "provider-6/gpt-4.1-mini",
            messages:[
                {"role": "system", "content": systemPrompt},
                {"role": "user", "content": `create a ${prompt} only code in html only`}
            ],
            temperature: 0.7,
            max_tokens: 2000, // Reduced tokens for faster response
            stream: false,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const htmlCode = response.choices[0].message.content;
        
        // Create blob and display in iframe
        const blob = new Blob([htmlCode], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        elements.websitePreview.src = url;
        elements.websitePreviewContainer.style.display = 'block';
        displayStatusMessage('builderStatus', 'success', 'Website built successfully!');
        
        // Store the code and prompt for re-editing
        currentWebsiteCode = htmlCode;
        currentWebsitePrompt = prompt;

        // Show the re-edit button
        elements.reEditWebsiteButton.style.display = 'inline-flex'; // Use inline-flex for action buttons
        
    } catch (error) {
        if (error.name === 'AbortError') {
            displayStatusMessage('builderStatus', 'error', 'Request timed out. Please try again.');
        } else {
            displayStatusMessage('builderStatus', 'error', `Error: ${error.message}`);
        }
    } finally {
        elements.buildWebsiteButton.classList.remove('loading');
        elements.buildWebsiteButton.disabled = false;
        elements.builderPromptInput.disabled = false;
        elements.builderLanguage.disabled = false;
        elements.builderStyle.disabled = false;
    }
});

// Re-edit Website functionality
elements.reEditWebsiteButton.addEventListener('click', reEditWebsite);

function reEditWebsite() {
    if (!currentWebsiteCode) {
        displayStatusMessage('builderStatus', 'error', 'No website code available to re-edit. Generate one first.', 3000);
        return;
    }

    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1002;
        padding: 20px;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--neon-cyan);
        border-radius: 20px;
        padding: 30px;
        width: 90%;
        max-width: 700px;
        box-shadow: 0 0 40px rgba(0,255,255,0.3);
        display: flex;
        flex-direction: column;
    `;

    // Prompt textarea
    const promptLabel = document.createElement('label');
    promptLabel.textContent = 'Describe the changes you want to make:';
    promptLabel.style.cssText = `
        display: block;
        margin-bottom: 10px;
        color: var(--text-secondary);
        font-weight: 500;
    `;

    const promptInput = document.createElement('textarea');
    promptInput.style.cssText = `
        width: 100%;
        min-height: 100px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 10px;
        padding: 15px;
        color: var(--text-primary);
        font-size: 1rem;
        resize: vertical;
        margin-bottom: 20px;
        flex-grow: 1; /* Allow textarea to grow */
    `;
    promptInput.placeholder = 'e.g. Change the hero section to a dark theme with animated particles...';

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        flex-wrap: wrap;
        margin-top: 10px; /* Space between textarea and buttons */
    `;

    // Update button
    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Update Website';
    updateBtn.className = 'action-btn'; // Re-use existing style
    updateBtn.style.maxWidth = 'none'; // Allow it to take full width in flex container
    
    // Open in new tab button (for current website code in modal context)
    const newTabBtn = document.createElement('button');
    newTabBtn.textContent = 'Open in New Tab';
    newTabBtn.className = 'download-btn'; // Re-use existing style
    newTabBtn.style.marginTop = '0'; // Override default margin from download-btn
    newTabBtn.style.maxWidth = 'none';

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'clear-btn'; // Re-use existing style
    cancelBtn.style.marginTop = '0'; // Override default margin from clear-btn
    cancelBtn.style.marginLeft = '0'; // Override default margin from clear-btn
    cancelBtn.style.maxWidth = 'none';

    // Event handlers
    updateBtn.onclick = async () => {
        const newPrompt = promptInput.value.trim();
        if (!newPrompt) {
            displayStatusMessage('builderStatus', 'error', 'Please describe the changes you want to make.', 3000);
            return;
        }

        displayStatusMessage('builderStatus', 'loading', 'Updating website...');
        modal.remove(); // Close modal immediately

        elements.buildWebsiteButton.classList.add('loading');
        elements.buildWebsiteButton.disabled = true;

        try {
            const response = await builderClient.chat.completions.create({
                model: "provider-6/gpt-4.1-mini",
                messages: [
                    { role: "system", content: "You are an expert web developer. The user provides existing HTML code plus a change request. Return ONLY the updated, self-contained HTML. Keep CSS in <style> and JS in <script> tags." },
                    { role: "user", content: `${currentWebsiteCode}\n\nPlease make the following changes:\n${newPrompt}` }
                ],
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            });

            const updatedCode = response.choices[0].message.content;
            const blob = new Blob([updatedCode], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            
            elements.websitePreview.src = url;
            currentWebsiteCode = updatedCode; // Update global variable with new code
            displayStatusMessage('builderStatus', 'success', 'Website updated successfully!');
        } catch (error) {
            displayStatusMessage('builderStatus', 'error', `Re-edit failed: ${error.message}`);
        } finally {
            elements.buildWebsiteButton.classList.remove('loading');
            elements.buildWebsiteButton.disabled = false;
        }
    };

    newTabBtn.onclick = () => {
        const blob = new Blob([currentWebsiteCode], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    cancelBtn.onclick = () => modal.remove();

    // Assemble modal
    buttonContainer.appendChild(updateBtn);
    buttonContainer.appendChild(newTabBtn);
    buttonContainer.appendChild(cancelBtn);
    
    modalContent.appendChild(promptLabel);
    modalContent.appendChild(promptInput);
    modalContent.appendChild(buttonContainer);
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    promptInput.focus();
}

// Chatbot Image Upload handling
elements.chatImageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        handleChatImageSelect(file);
    } else {
        removeChatImage();
    }
});

elements.removeChatImageBtn.addEventListener('click', removeChatImage);

function handleChatImageSelect(file) {
    selectedChatImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.chatImagePreview.src = e.target.result;
        elements.chatImagePreviewContainer.style.display = 'flex';
        // Adjust chat input container layout if necessary
    };
    reader.readAsDataURL(file);
}

function removeChatImage() {
    selectedChatImage = null;
    elements.chatImagePreview.src = '';
    elements.chatImagePreviewContainer.style.display = 'none';
    elements.chatImageUpload.value = ''; // Clear file input
}

// Chat functionality
elements.sendBotButton.addEventListener('click', sendBotMessage);
elements.botInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBotMessage();
    }
});

async function sendBotMessage() {
    const textMessage = elements.botInput.value.trim();
    const imageFile = selectedChatImage;

    if (!textMessage && !imageFile) {
        displayStatusMessage('botStatus', 'error', 'Please enter a message or select an image.');
        return;
    }

    // Add user message to chat history immediately
    const userMessageContent = [];
    if (textMessage) {
        userMessageContent.push({ type: 'text', text: textMessage });
    }
    let imageUrlForChat = null;
    if (imageFile) {
        imageUrlForChat = URL.createObjectURL(imageFile); // Use Object URL for display
        userMessageContent.push({ type: 'image_url', url: imageUrlForChat, text: textMessage }); // Pass text here
    }
    addChatMessage(userMessageContent, 'user');

    elements.botInput.value = '';
    elements.botInput.style.height = 'auto';
    removeChatImage(); // Clear selected image after adding to chat

    // Show typing indicator
    showTypingIndicator();

    elements.sendBotButton.classList.add('loading');
    elements.sendBotButton.disabled = true;
    elements.botInput.disabled = true;
    elements.chatImageUpload.disabled = true; // Disable image upload during processing
    displayStatusMessage('botStatus', 'loading', 'Thinking...');

    try {
        const messages = [{"role": "system", "content": "You are a helpful AI assistant. Be concise, friendly, and provide useful responses."}];
        
        const userContentArray = [];
        if (textMessage) {
            userContentArray.push({ type: "text", text: textMessage });
        }
        if (imageFile) {
            // Encode image to base64 for the API call
            const reader = new FileReader();
            const base64ImagePromise = new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(imageFile);
            });
            const dataUrl = await base64ImagePromise;
            userContentArray.push({
                type: "image_url",
                image_url: {
                    url: dataUrl
                }
            });
        }
        messages.push({"role": "user", "content": userContentArray});

        const response = await botClient.chat.completions.create({
            model: "provider-6/gemini-2.5-flash-thinking", // Model for image/text
            messages: messages,
            temperature: 0.7,
            max_tokens: 400, // Increased max_tokens for image descriptions
            stream: false
        });

        const botResponse = response.choices[0].message.content;
        
        // Remove typing indicator
        removeTypingIndicator();
        
        // Add bot response
        addChatMessage([{ type: 'text', text: botResponse }], 'bot');
        displayStatusMessage('botStatus', 'success', 'Response received!');
        
    } catch (error) {
        removeTypingIndicator();
        displayStatusMessage('botStatus', 'error', `Error: ${error.message}`);
        addChatMessage([{ type: 'text', text: 'Sorry, I encountered an error. Please try again.' }], 'bot');
    } finally {
        elements.sendBotButton.classList.remove('loading');
        elements.sendBotButton.disabled = false;
        elements.botInput.disabled = false;
        elements.chatImageUpload.disabled = false; // Re-enable image upload
        elements.botInput.focus();
    }
}

function addChatMessage(content, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.textContent = sender === 'user' ? '👤' : '🤖';
    
    contentDiv.appendChild(avatarDiv);

    // Only one text block for the message
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    
    content.forEach(item => {
        if (item.type === 'text') {
            textDiv.textContent = item.text; // Set text content for the single text div
        } else if (item.type === 'image_url' && item.url) {
            const imageEl = document.createElement('img');
            imageEl.src = item.url;
            imageEl.className = 'message-image';
            contentDiv.appendChild(imageEl); // Add image directly to contentDiv
        }
    });

    // Append textDiv only if it has content (or if it's a bot message)
    if (textDiv.textContent || sender === 'bot') {
        contentDiv.appendChild(textDiv);
    }
    
    messageDiv.appendChild(contentDiv);
    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    elements.chatMessages.appendChild(typingDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Auto-resize textarea
elements.botInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// Preview controls
document.getElementById('previewDesktop').addEventListener('click', () => {
    elements.websitePreview.className = '';
    updatePreviewButtons('previewDesktop');
});

document.getElementById('previewMobile').addEventListener('click', () => {
    elements.websitePreview.className = 'mobile';
    updatePreviewButtons('previewMobile');
});

document.getElementById('previewTablet').addEventListener('click', () => {
    elements.websitePreview.className = 'tablet';
    updatePreviewButtons('previewTablet');
});

function updatePreviewButtons(activeId) {
    document.querySelectorAll('.preview-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

// Download code
elements.downloadCodeButton.addEventListener('click', () => {
    if (currentWebsiteCode) {
        const blob = new Blob([currentWebsiteCode], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        downloadMedia(url, `website-${Date.now()}.html`);
    } else {
        displayStatusMessage('builderStatus', 'error', 'No website code to download.', 3000);
    }
});

// Edit code functionality
elements.editCodeButton.addEventListener('click', () => {
    if (currentWebsiteCode) {
        const textArea = document.createElement('textarea');
        textArea.value = currentWebsiteCode;
        textArea.style.width = '100%';
        textArea.style.height = '400px';
        textArea.style.background = 'var(--bg-secondary)';
        textArea.style.color = 'var(--text-primary)';
        textArea.style.border = '1px solid rgba(255,255,255,0.2)';
        textArea.style.borderRadius = '10px';
        textArea.style.padding = '15px';
        textArea.style.fontFamily = 'monospace';
        textArea.style.fontSize = '14px';
        
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.8)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '1001';
        
        const container = document.createElement('div');
        container.style.width = '90%';
        container.style.maxWidth = '800px';
        container.style.background = 'var(--bg-primary)';
        container.style.padding = '30px';
        container.style.borderRadius = '15px';
        container.style.border = '1px solid var(--neon-cyan)';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save & Update Preview';
        saveBtn.className = 'action-btn';
        saveBtn.style.marginTop = '15px';
        saveBtn.onclick = () => {
            currentWebsiteCode = textArea.value;
            const blob = new Blob([textArea.value], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            elements.websitePreview.src = url;
            modal.remove();
        };
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'download-btn';
        cancelBtn.style.marginTop = '15px';
        cancelBtn.style.marginLeft = '10px';
        cancelBtn.onclick = () => modal.remove();
        
        container.appendChild(textArea);
        container.appendChild(saveBtn);
        container.appendChild(cancelBtn);
        modal.appendChild(container);
        document.body.appendChild(modal);
    }
});

// Prompt enhancement functionality
function createEnhancer(promptElementId, statusElementId) {
    return async function() {
        const promptElement = document.getElementById(promptElementId);
        const originalPrompt = promptElement.value.trim();
        
        if (!originalPrompt) {
            displayStatusMessage(statusElementId, 'error', 'Please enter a prompt to enhance.');
            return;
        }

        displayStatusMessage(statusElementId, 'loading', 'Enhancing prompt with AI...');
        
        try {
            const response = await promptEnhancerClient.chat.completions.create({
                model: "provider-6/deepseek-r1-uncensored",
                messages: [{
                    role: "user",
                    content: `Enhance this prompt for AI generation: "${originalPrompt}". Make it more detailed and creative while keeping the original intent. Return only the enhanced prompt.`
                }],
                temperature: 0.8,
                max_tokens: 200,
                stream: false
            });

            const enhancedPrompt = response.choices[0].message.content;
            promptElement.value = enhancedPrompt;
            displayStatusMessage(statusElementId, 'success', 'Prompt enhanced successfully!');
            
        } catch (error) {
            displayStatusMessage(statusElementId, 'error', `Enhancement failed: ${error.message}`);
        }
    };
}

// Attach enhancement functions to buttons
if (elements.enhanceImagePrompt) {
    elements.enhanceImagePrompt.addEventListener('click', createEnhancer('imageGeneratorPromptInput', 'imageGeneratorStatus'));
}
if (elements.enhanceBuilderPrompt) {
    elements.enhanceBuilderPrompt.addEventListener('click', createEnhancer('builderPromptInput', 'builderStatus'));
}

// Function to copy code to clipboard
async function copyCodeToClipboard(codeElementId) {
    const codeElement = document.getElementById(codeElementId);
    if (codeElement && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(codeElement.textContent);
            displayStatusMessage('globalAppStatus', 'success', 'Code copied to clipboard!', 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
            displayStatusMessage('globalAppStatus', 'error', 'Failed to copy code.', 3000);
        }
    } else {
        displayStatusMessage('globalAppStatus', 'error', 'Clipboard API not supported or element not found.', 3000);
    }
}

// Add event listeners for copy code buttons
elements.copyCodeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        copyCodeToClipboard(targetId);
    });
});

// Add clear button functionality
function setupClearButtons() {
    const clearButtons = [
        { buttonId: 'clearImagePromptBtn', textareaId: 'imageGeneratorPromptInput', statusId: 'imageGeneratorStatus' },
        { buttonId: 'clearBuilderPromptBtn', textareaId: 'builderPromptInput', statusId: 'builderStatus' },
    ];

    clearButtons.forEach(({ buttonId, textareaId, statusId }) => {
        const button = document.getElementById(buttonId);
        const textarea = document.getElementById(textareaId);
        if (button && textarea) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                textarea.value = '';
                textarea.focus();
                displayStatusMessage(statusId, 'success', 'Prompt cleared!', 1500);
            });
        }
    });
}

// Utility functions (keeping these for general use, though displayStatusMessage is preferred for specific tasks)
function showLoading() {
    elements.loading.style.display = 'flex';
}

function hideLoading() {
    elements.loading.style.display = 'none';
}

function showError(message) {
    elements.errorMessage.querySelector('.error-text').textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
        elements.errorMessage.style.display = 'none';
    }, 5000);
}

// Add event listener for "Open in New Tab" button
elements.openInNewTabButton.addEventListener('click', () => {
    if (currentWebsiteCode) {
        const blob = new Blob([currentWebsiteCode], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        displayStatusMessage('builderStatus', 'success', 'Website opened in new tab!', 3000);
    } else {
        displayStatusMessage('builderStatus', 'error', 'No website available to open.', 3000);
    }
});

// Add intersection observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animationDelay = '0.1s';
            entry.target.classList.add('animate-in');
        }
    } );
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    setupClearButtons();
    // Re-select all elements that might need animation after DOM update
    const animatedElements = document.querySelectorAll('.input-group, button, .tab-content, .upload-zone, .image-preview-container, .result-container, .option-group'); // Added .option-group
    animatedElements.forEach(el => observer.observe(el));
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '1':
                e.preventDefault();
                switchTab('imageGenerator');
                break;
            case '2':
                e.preventDefault();
                switchTab('builder');
                break;
            case '3':
                e.preventDefault();
                switchTab('bot');
                break;
            case '4': // New shortcut for API tab
                e.preventDefault();
                switchTab('api');
                break;
        }
    }
});

// Add tooltip system
const tooltips = {
    'imageGeneratorPromptInput': 'Describe the image you want to create',
    'chatImageUpload': 'Upload an image for the chatbot to analyze',
};

Object.keys(tooltips).forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.title = tooltips[id];
    }
});

// Set initial active tab
switchTab('imageGenerator');