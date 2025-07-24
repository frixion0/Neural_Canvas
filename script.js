import { OpenAI } from 'https://cdn.skypack.dev/openai';

// Global variables and setup
let selectedFile = null;
let currentTab = 'imageEditor';

// OpenAI clients
const imageEditClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1/images/edits",
    dangerouslyAllowBrowser: true,
});

const imageGenerateClient = new OpenAI({
    apiKey: 'ddc-a4f-25c62da6794b4fdf9720708012108518',
    baseURL: "https://api.a4f.co/v1",
    dangerouslyAllowBrowser: true,
});

// DOM elements
const elements = {
    imageUpload: document.getElementById('imageUpload'),
    uploadZone: document.getElementById('uploadZone'),
    imagePreview: document.getElementById('imagePreview'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    editedImage: document.getElementById('editedImage'),
    editedImageContainer: document.getElementById('editedImageContainer'),
    promptInput: document.getElementById('promptInput'),
    editButton: document.getElementById('editButton'),
    imageGeneratorPromptInput: document.getElementById('imageGeneratorPromptInput'),
    imageSize: document.getElementById('imageSize'),
    imageStyle: document.getElementById('imageStyle'),
    generateImageButton: document.getElementById('generateImageButton'),
    generatedImage: document.getElementById('generatedImage'),
    generatedImageContainer: document.getElementById('generatedImageContainer'),
    videoPromptInput: document.getElementById('videoPromptInput'),
    videoRatio: document.getElementById('videoRatio'),
    videoQuality: document.getElementById('videoQuality'),
    videoDuration: document.getElementById('videoDuration'),
    generateVideoButton: document.getElementById('generateVideoButton'),
    generatedVideo: document.getElementById('generatedVideo'),
    generatedVideoContainer: document.getElementById('generatedVideoContainer'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('errorMessage'),
    editedImageDownloadButton: document.getElementById('editedImageDownloadButton'),
    generatedImageDownloadButton: document.getElementById('generatedImageDownloadButton'),
    generatedVideoDownloadButton: document.getElementById('generatedVideoDownloadButton'),
    // New status message elements
    imageEditorStatus: document.getElementById('imageEditorStatus'),
    imageGeneratorStatus: document.getElementById('imageGeneratorStatus'),
    videoGeneratorStatus: document.getElementById('videoGeneratorStatus'),
    // globalAppStatus will be used for general app messages like download errors or image loading for editor
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
        statusDiv.className = 'generator-status-message'; // Reset class
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

// Tab switching functionality
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        const tabs = ['imageEditor', 'imageGenerator', 'videoGenerator'];
        switchTab(tabs[index]);
        // Clear any lingering status messages when switching tabs
        clearStatusMessage('imageEditorStatus');
        clearStatusMessage('imageGeneratorStatus');
        clearStatusMessage('videoGeneratorStatus');
        // Clear globalAppStatus as well, as it might relate to a previous action
        clearStatusMessage('globalAppStatus');
    });
});

function switchTab(tabName) {
    currentTab = tabName;
    
    // Update active states
    tabButtons.forEach((btn, index) => {
        btn.classList.toggle('active', ['imageEditor', 'imageGenerator', 'videoGenerator'][index] === tabName);
    });
    
    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Section`).classList.add('active');
}

// File upload functionality
elements.uploadZone.addEventListener('click', () => elements.imageUpload.click());
elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.add('dragover');
});
elements.uploadZone.addEventListener('dragleave', () => {
    elements.uploadZone.classList.remove('dragover');
});
elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageSelect(file);
    }
});

elements.imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleImageSelect(file);
    }
});

function handleImageSelect(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.imagePreview.src = e.target.result;
        elements.imagePreviewContainer.style.display = 'block';
        elements.uploadZone.style.display = 'none';
        elements.editButton.disabled = false;
        clearStatusMessage('imageEditorStatus'); // Clear status when new image is selected
        elements.editedImageContainer.style.display = 'none'; // Hide previous result
    };
    reader.readAsDataURL(file);
}

function removeImage() {
    selectedFile = null;
    elements.imagePreviewContainer.style.display = 'none';
    elements.uploadZone.style.display = 'flex';
    elements.editButton.disabled = true;
    elements.imageUpload.value = '';
    elements.editedImageContainer.style.display = 'none'; // Hide result when image is removed
    clearStatusMessage('imageEditorStatus');
}

// Image editing functionality
elements.editButton.addEventListener('click', async () => {
    const prompt = elements.promptInput.value.trim();
    if (!selectedFile || !prompt) {
        displayStatusMessage('imageEditorStatus', 'error', 'Please select an image and enter a prompt.');
        return;
    }

    elements.editButton.classList.add('loading');
    elements.editButton.disabled = true;
    elements.promptInput.disabled = true;
    elements.uploadZone.style.pointerEvents = 'none'; // Disable upload zone during edit
    elements.editedImageContainer.style.display = 'none'; // Hide previous result
    displayStatusMessage('imageEditorStatus', 'loading', 'Transforming image with AI...');

    try {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', prompt);
        formData.append('model', 'provider-6/black-forest-labs-flux-1-kontext-dev');
        formData.append('response_format', 'url');

        const response = await fetch('https://api.a4f.co/v1/images/edits', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${imageEditClient.apiKey}`,
            },
            body: formData,
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Image editing failed');

        elements.editedImage.src = data.data[0].url;
        elements.editedImageContainer.style.display = 'block';
        displayStatusMessage('imageEditorStatus', 'success', 'Image transformed successfully!');
        
    } catch (error) {
        displayStatusMessage('imageEditorStatus', 'error', `Error: ${error.message}`);
    } finally {
        elements.editButton.classList.remove('loading');
        elements.editButton.disabled = !selectedFile; // Re-enable only if image is still selected
        elements.promptInput.disabled = false;
        elements.uploadZone.style.pointerEvents = 'auto'; // Re-enable upload zone
    }
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
    elements.imageStyle.disabled = true;
    elements.generatedImageContainer.style.display = 'none'; // Hide previous result
    displayStatusMessage('imageGeneratorStatus', 'loading', 'Generating image with AI...');

    try {
        const response = await imageGenerateClient.images.generate({
            model: "provider-6/FLUX.1-pro",
            prompt: `${prompt}, ${elements.imageStyle.value}`,
            n: 1,
            size: elements.imageSize.value,
        });

        const imageUrl = response.data[0].url;
        elements.generatedImage.src = imageUrl;
        elements.generatedImageContainer.style.display = 'block';
        displayStatusMessage('imageGeneratorStatus', 'success', 'Image generated successfully!');
        
        // Remove existing "Edit this image" button if any
        const existingEditButton = elements.generatedImageContainer.querySelector('.edit-generated-btn');
        if (existingEditButton) {
            existingEditButton.remove();
        }

        // Add "Edit this image" button
        const editButton = document.createElement('button');
        editButton.className = 'edit-generated-btn';
        editButton.innerHTML = '✨ Edit this image';
        editButton.onclick = () => loadGeneratedImageForEditing(imageUrl);
        elements.generatedImageContainer.appendChild(editButton);
        
    } catch (error) {
        displayStatusMessage('imageGeneratorStatus', 'error', `Error: ${error.message}`);
    } finally {
        elements.generateImageButton.classList.remove('loading');
        elements.generateImageButton.disabled = false;
        elements.imageGeneratorPromptInput.disabled = false;
        elements.imageSize.disabled = false;
        elements.imageStyle.disabled = false;
    }
});

// New function to load generated image into image editor
async function loadGeneratedImageForEditing(imageUrl) {
    // Show a loading status in the editor tab immediately
    displayStatusMessage('imageEditorStatus', 'loading', 'Loading image into editor...');
    // Switch to image editor tab
    switchTab('imageEditor');
    
    // Load the image
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const blob = await response.blob();
        
        // Get content type from response headers, default to 'image/jpeg' if not found
        const contentType = response.headers.get('Content-Type') || 'image/jpeg';
        const fileExtension = contentType.split('/')[1] || 'jpg'; // e.g., 'image/png' -> 'png'
        const file = new File([blob], `generated-image.${fileExtension}`, { type: contentType });
        
        handleImageSelect(file);
        
        // Show success message locally within the editor tab
        displayStatusMessage('imageEditorStatus', 'success', 'Image loaded! Add your editing prompt below.');
    } catch (error) {
        displayStatusMessage('imageEditorStatus', 'error', `Failed to load image: ${error.message}`); // Use editor status for this action
        console.error('Failed to load generated image for editing:', error);
    }
}

// Video generation functionality
elements.generateVideoButton.addEventListener('click', async () => {
    const prompt = elements.videoPromptInput.value.trim();
    if (!prompt) {
        displayStatusMessage('videoGeneratorStatus', 'error', 'Please enter a prompt for video generation.');
        return;
    }

    elements.generateVideoButton.classList.add('loading');
    elements.generateVideoButton.disabled = true;
    elements.videoPromptInput.disabled = true;
    elements.videoRatio.disabled = true;
    elements.videoQuality.disabled = true;
    elements.videoDuration.disabled = true;
    elements.generatedVideoContainer.style.display = 'none'; // Hide previous result
    displayStatusMessage('videoGeneratorStatus', 'loading', 'Generating video with AI...');

    try {
        const payload = {
            model: 'provider-6/wan-2.1',
            prompt: prompt,
            ratio: elements.videoRatio.value,
            quality: elements.videoQuality.value,
            duration: parseInt(elements.videoDuration.value),
        };

        const response = await fetch('https://api.a4f.co/v1/video/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${imageGenerateClient.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Video generation failed');

        elements.generatedVideo.src = data.data[0].url;
        elements.generatedVideoContainer.style.display = 'block';
        displayStatusMessage('videoGeneratorStatus', 'success', 'Video generated successfully!');
        
    } catch (error) {
        displayStatusMessage('videoGeneratorStatus', 'error', `Error: ${error.message}`);
    } finally {
        elements.generateVideoButton.classList.remove('loading');
        elements.generateVideoButton.disabled = false;
        elements.videoPromptInput.disabled = false;
        elements.videoRatio.disabled = false;
        elements.videoQuality.disabled = false;
        elements.videoDuration.disabled = false;
    }
});

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

// Add event listeners for download buttons
elements.editedImageDownloadButton.addEventListener('click', () => {
    const imageUrl = elements.editedImage.src;
    if (imageUrl && imageUrl !== window.location.href) { // Ensure src is not just empty or base page URL
        downloadMedia(imageUrl, `edited-image-${Date.now()}.jpg`);
    } else {
        displayStatusMessage('globalAppStatus', 'error', 'No image available to download.', 3000);
    }
});
elements.generatedImageDownloadButton.addEventListener('click', () => {
    const imageUrl = elements.generatedImage.src;
    if (imageUrl && imageUrl !== window.location.href) {
        downloadMedia(imageUrl, `generated-image-${Date.now()}.jpg`);
    } else {
        displayStatusMessage('globalAppStatus', 'error', 'No image available to download.', 3000);
    }
});
elements.generatedVideoDownloadButton.addEventListener('click', () => {
    const videoUrl = elements.generatedVideo.src;
    if (videoUrl && videoUrl !== window.location.href) {
        downloadMedia(videoUrl, `generated-video-${Date.now()}.mp4`);
    } else {
        displayStatusMessage('globalAppStatus', 'error', 'No video available to download.', 3000);
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
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.input-group, button, .tab-content, .upload-zone, .image-preview-container, .result-container');
    animatedElements.forEach(el => observer.observe(el));
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '1':
                e.preventDefault();
                switchTab('imageEditor');
                break;
            case '2':
                e.preventDefault();
                switchTab('imageGenerator');
                break;
            case '3':
                e.preventDefault();
                switchTab('videoGenerator');
                break;
        }
    }
});

// Add tooltip system
const tooltips = {
    'imageUpload': 'Select an image to edit with AI',
    'promptInput': 'Describe what changes you want to make',
    'imageGeneratorPromptInput': 'Describe the image you want to create',
    'videoPromptInput': 'Describe the video you want to generate'
};

Object.keys(tooltips).forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.title = tooltips[id];
    }
});

// Initially disable the image edit button and set initial tab
elements.editButton.disabled = true;
switchTab('imageEditor'); // Simulate click to set initial active tab