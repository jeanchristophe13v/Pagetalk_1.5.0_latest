/**
 * Pagetalk - UI Update and DOM Manipulation Functions
 */
import { generateUniqueId, escapeHtml } from './utils.js';
import { renderDynamicContent } from './render.js';
import { showFullSizeImage } from './image.js'; // Assuming image modal logic is in image.js

// --- Global Variables (Accessed via parameters) ---
// let state; // Reference passed in
// let elements; // Reference passed in
// let currentTranslations = {}; // Reference passed in

/**
 * Helper function to get translation string
 * @param {string} key
 * @param {object} [replacements={}]
 * @param {object} translations - The current translations object
 * @returns {string}
 */
function _(key, replacements = {}, translations) {
  let translation = translations[key] || key;
  for (const placeholder in replacements) {
    translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
  }
  return translation;
}

/**
 * 切换标签页
 * @param {string} tabId - 要显示的标签页ID
 * @param {object} elements - DOM elements reference
 * @param {function} switchSettingsSubTab - Callback to switch settings subtab
 */
export function switchTab(tabId, elements, switchSettingsSubTab) {
    elements.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    elements.tabContents.forEach(content => content.classList.toggle('active', content.id === tabId));

    if (tabId === 'settings') {
        const activeSubTab = document.querySelector('.settings-nav-btn.active');
        if (!activeSubTab) {
            switchSettingsSubTab('general'); // Call the function passed from main.js
        }
    }
}

/**
 * 切换设置内部的子标签页
 * @param {string} subTabId - 要显示的子标签页ID ('general', 'agent', 'model')
 * @param {object} elements - DOM elements reference
 */
export function switchSettingsSubTab(subTabId, elements) {
    elements.settingsNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subTabId);
    });
    elements.settingsSubContents.forEach(content => {
        content.classList.toggle('active', content.id === `settings-${subTabId}`);
    });
}

/**
 * 向聊天区域添加消息 - 使用markdown-it渲染
 * @param {string|null} content - 文本内容，可以为null
 * @param {'user'|'bot'} sender - 发送者
 * @param {object} options - 选项对象 { isStreaming, images, insertAfterElement, forceScroll }
 * @param {object} state - Global state reference
 * @param {object} elements - DOM elements reference
 * @param {object} currentTranslations - Translations object
 * @param {function} addCopyButtonToCodeBlock - Callback to add copy button
 * @param {function} addMessageActionButtons - Callback to add action buttons
 * @param {boolean} isUserNearBottom - Whether user is scrolled near bottom
 * @returns {HTMLElement} 创建的消息元素
 */
export function addMessageToChat(content, sender, options = {}, state, elements, currentTranslations, addCopyButtonToCodeBlock, addMessageActionButtons, isUserNearBottom) {
    const { isStreaming = false, images = [], insertAfterElement = null, forceScroll = false } = options;
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    const messageId = generateUniqueId();
    messageElement.dataset.messageId = messageId;

    if (insertAfterElement && insertAfterElement.parentNode === elements.chatMessages) {
        insertAfterElement.insertAdjacentElement('afterend', messageElement);
    } else {
        elements.chatMessages.appendChild(messageElement);
    }

    if (isStreaming) {
        return messageElement; // Return early for streaming
    }

    // --- Non-streaming or final render ---
    let messageHTML = '';
    if (sender === 'user' && images.length > 0) {
        messageHTML += '<div class="message-images">';
        images.forEach((image, index) => {
            // Use escapeHtml for alt text just in case
            const altText = escapeHtml(_('imageAlt', { index: index + 1 }, currentTranslations));
            // Add data-url for click handler
            messageHTML += `<img class="message-image" src="${escapeHtml(image.dataUrl)}" alt="${altText}" data-index="${index}" data-url="${escapeHtml(image.dataUrl)}">`;
        });
        messageHTML += '</div>';
    }

    if (content) {
        // Use MarkdownRenderer (assuming it's globally available or passed in)
        messageHTML += window.MarkdownRenderer.render(content);
    }

    messageElement.innerHTML = messageHTML;

    // Add click listeners for user images AFTER setting innerHTML
    if (sender === 'user' && images.length > 0) {
        messageElement.querySelectorAll('.message-image').forEach(img => {
            img.addEventListener('click', () => {
                showFullSizeImage(img.dataset.url, elements); // Use data-url
            });
        });
    }


    const codeBlocks = messageElement.querySelectorAll('.code-block');
    codeBlocks.forEach(addCopyButtonToCodeBlock); // Use callback

    addMessageActionButtons(messageElement, content || ''); // Use callback

    renderDynamicContent(messageElement, elements); // Render KaTeX/Mermaid

    // Scroll only if forced or user is near bottom
    if (forceScroll || isUserNearBottom) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    return messageElement;
}


/**
 * 更新流式消息 - 使用markdown-it渲染
 * @param {HTMLElement} messageElement - 消息元素
 * @param {string} content - 当前累积的内容
 * @param {boolean} isUserNearBottom - Whether user is scrolled near bottom
 * @param {object} elements - DOM elements reference
 */
export function updateStreamingMessage(messageElement, content, isUserNearBottom, elements) {
    let formattedContent = window.MarkdownRenderer.render(content);

    const streamingCursor = document.createElement('span');
    streamingCursor.className = 'streaming-cursor';

    const messageActions = messageElement.querySelector('.message-actions');
    messageElement.innerHTML = formattedContent;
    if (messageActions) {
        messageElement.appendChild(messageActions);
    }

    // Temporarily disable dynamic rendering during streaming to avoid errors/performance issues
    // renderDynamicContent(messageElement, elements);

    messageElement.appendChild(streamingCursor);

    if (isUserNearBottom) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

/**
 * 完成机器人消息的最终渲染（流结束后调用）
 * @param {HTMLElement} messageElement - 消息元素
 * @param {string} finalContent - 最终的完整内容
 * @param {function} addCopyButtonToCodeBlock - Callback
 * @param {function} addMessageActionButtons - Callback
 * @param {function} restoreSendButtonAndInput - Callback
 * @param {boolean} isUserNearBottom - Whether user is scrolled near bottom
 * @param {object} elements - DOM elements reference
 */
export function finalizeBotMessage(messageElement, finalContent, addCopyButtonToCodeBlock, addMessageActionButtons, restoreSendButtonAndInput, isUserNearBottom, elements) {
    const streamingCursor = messageElement.querySelector('.streaming-cursor');
    if (streamingCursor) {
        streamingCursor.remove();
    }

    messageElement.innerHTML = window.MarkdownRenderer.render(finalContent);

    const codeBlocks = messageElement.querySelectorAll('.code-block');
    codeBlocks.forEach(addCopyButtonToCodeBlock);

    addMessageActionButtons(messageElement, finalContent);

    renderDynamicContent(messageElement, elements); // Final render

    if (isUserNearBottom) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    restoreSendButtonAndInput(); // Restore button state
}

/**
 * 添加AI思考动画到聊天区域
 * @param {HTMLElement|null} insertAfterElement - Optional element to insert after
 * @param {object} elements - DOM elements reference
 * @param {boolean} isUserNearBottom - Whether user is scrolled near bottom
 * @returns {HTMLElement} The thinking animation element
 */
export function addThinkingAnimation(insertAfterElement = null, elements, isUserNearBottom) {
    const thinkingElement = document.createElement('div');
    thinkingElement.classList.add('message', 'bot-message', 'thinking');

    const thinkingDots = document.createElement('div');
    thinkingDots.classList.add('thinking-dots');
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        thinkingDots.appendChild(dot);
    }
    thinkingElement.appendChild(thinkingDots);

    if (insertAfterElement && insertAfterElement.parentNode === elements.chatMessages) {
        insertAfterElement.insertAdjacentElement('afterend', thinkingElement);
    } else {
        elements.chatMessages.appendChild(thinkingElement);
    }

    if (isUserNearBottom) {
        thinkingElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    return thinkingElement;
}

/**
 * 显示连接状态消息 (模型设置页)
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型 ('success' 或 'error' 或 'info')
 * @param {object} elements - DOM elements reference
 */
export function showConnectionStatus(message, type, elements) {
    if (!elements.connectionStatus) return;
    elements.connectionStatus.textContent = message;
    elements.connectionStatus.className = 'connection-status ' + type;
    elements.connectionStatus.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            // Check if the message is still the same before hiding
            if (elements.connectionStatus.textContent === message) {
                 elements.connectionStatus.style.display = 'none';
            }
        }, 3000);
    }
}

/**
 * 更新页脚连接状态指示器
 * @param {boolean} isConnected - Connection status
 * @param {object} elements - DOM elements reference
 * @param {object} currentTranslations - Translations object
 */
export function updateConnectionIndicator(isConnected, elements, currentTranslations) {
    if (!elements.connectionIndicator) return;
    elements.connectionIndicator.className = isConnected ? 'connected' : 'disconnected';
    elements.connectionIndicator.textContent = isConnected ? _('connectionIndicatorConnected', {}, currentTranslations) : _('connectionIndicatorDisconnected', {}, currentTranslations);
}

/**
 * 更新页脚上下文状态
 * @param {string|null} contextStatusKey - Translation key ('contextStatusNone', 'contextStatusExtracting', 'contextStatusFailed', 'contextStatusChars')
 * @param {object} replacements - Replacements for the translation key (e.g., { charCount: 123 })
 * @param {object} elements - DOM elements reference
 * @param {object} currentTranslations - Translations object
 */
export function updateContextStatus(contextStatusKey, replacements = {}, elements, currentTranslations) {
    if (!elements.contextStatus) return;
    const prefix = _('contextStatusPrefix', {}, currentTranslations);
    const statusText = _(contextStatusKey, replacements, currentTranslations);
    elements.contextStatus.textContent = `${prefix} ${statusText}`;
}


/**
 * 显示通知提示 (Toast)
 * @param {string} message - 消息内容
 * @param {string} type - 提示类型 ('success' 或 'error')
 */
export function showToast(message, type) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `toast ${type}`;

    // Force reflow before adding 'show' class for transition
    void toast.offsetWidth;

    toast.classList.add('show');

    // Hide after duration
    setTimeout(() => {
        toast.classList.remove('show');
        // Optional: remove the element after transition
        // setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 2000);
}

/**
 * 根据内容调整文本框高度
 * @param {object} elements - DOM elements reference
 */
export function resizeTextarea(elements) {
    const textarea = elements.userInput;
    if (!textarea) return;

    // Temporarily reset height to get accurate scrollHeight
    textarea.style.height = 'auto';

    const computedStyle = getComputedStyle(textarea);
    const paddingY = parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
    const borderY = parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth);

    // Use scrollHeight, ensure it includes padding and border if box-sizing is border-box (default)
    const scrollHeight = textarea.scrollHeight;

    // Read min/max height from CSS variables or use defaults
    const minHeight = parseFloat(computedStyle.minHeight) || 32; // Default 32px
    const maxHeight = parseFloat(computedStyle.maxHeight) || 160; // Default 160px

    // Calculate the content height (scrollHeight already includes padding/border with border-box)
    let newHeight = scrollHeight;

    // Clamp the height between min and max
    newHeight = Math.max(minHeight, newHeight);
    newHeight = Math.min(newHeight, maxHeight);

    textarea.style.height = newHeight + 'px';

    // Show scrollbar if content exceeds max height
    textarea.style.overflowY = (scrollHeight > maxHeight) ? 'scroll' : 'hidden';
}


/**
 * 设置输入框自适应高度的事件监听
 * @param {object} elements - DOM elements reference
 */
export function setupAutoresizeTextarea(elements) {
    const textarea = elements.userInput;
    if (!textarea) return;

    textarea.addEventListener('input', () => resizeTextarea(elements));
    textarea.addEventListener('paste', () => setTimeout(() => resizeTextarea(elements), 0)); // Handle paste

    // Initial resize
    setTimeout(() => resizeTextarea(elements), 0);
}

/**
 * 更新界面上所有需要翻译的静态元素
 * @param {object} currentTranslations - Translations object
 */
export function updateUIElementsWithTranslations(currentTranslations) {
    if (!currentTranslations || Object.keys(currentTranslations).length === 0) {
        console.warn('No translations loaded, UI update skipped.');
        return;
    }

    const _tr = (key, rep = {}) => _(key, rep, currentTranslations);

    document.documentElement.lang = _tr('htmlLang');
    document.title = _tr('pageTitle');

    // --- Helpers ---
    const setText = (selector, key, rep = {}) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = _tr(key, rep);
        // else console.warn(`Element not found for setText: ${selector}`);
    };
    const setAttr = (selector, attr, key, rep = {}) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, _tr(key, rep));
       // else console.warn(`Element not found for setAttr: ${selector}`);
    };
    const setPlaceholder = (selector, key, rep = {}) => setAttr(selector, 'placeholder', key, rep);
    const setTitle = (selector, key, rep = {}) => setAttr(selector, 'title', key, rep);

    // --- Apply Translations ---
    setText('label[for="chat-model-selection"]', 'modelLabel');
    setAttr('#chat-model-selection', 'aria-label', 'modelSelectLabel');
    setText('label[for="chat-agent-selection"]', 'agentLabel');
    setAttr('#chat-agent-selection', 'aria-label', 'agentSelectLabel');
    setTitle('#clear-context', 'clearContextTitle');
    setTitle('#close-panel', 'closePanelTitle');
    // Welcome message updated dynamically
    setAttr('#modal-image', 'alt', 'imagePreviewAltTranslated');
    setTitle('#upload-image', 'uploadImageTitle');
    setPlaceholder('#user-input', 'userInputPlaceholder');
    setTitle('#send-message', 'sendMessageTitle'); // Default title

    setText('.footer-tab[data-tab="chat"]', 'chatTab');
    setText('.footer-tab[data-tab="settings"]', 'settingsTab');

    setText('.settings-nav-btn[data-subtab="general"]', 'generalSettingsNav');
    setText('.settings-nav-btn[data-subtab="agent"]', 'agentSettingsNav');
    setText('.settings-nav-btn[data-subtab="model"]', 'modelSettingsNav');
    setTitle('#close-panel-settings', 'closePanelTitle');

    setText('#settings-general h2', 'generalSettingsHeading');
    setText('label[for="language-select"]', 'languageLabel');
    setText('label[for="export-format"]', 'exportChatLabel');
    setText('#export-format option[value="markdown"]', 'exportFormatMarkdown');
    setText('#export-format option[value="text"]', 'exportFormatText');
    setText('#export-chat-history', 'exportButton');

    setText('#settings-agent h2', 'agentSettingsHeading');
    setText('.agents-list-header h3', 'agentsListHeading');
    setTitle('#add-new-agent', 'addNewAgentTitle');
    setTitle('#import-agents', 'importAgentConfigTitle');
    setTitle('#export-agents', 'exportAgentConfigTitle');
    // Agent list items updated dynamically
    setText('#delete-confirm-dialog h3', 'deleteConfirmHeading');
    setText('#cancel-delete', 'cancel');
    setText('#confirm-delete', 'delete');

    setText('#settings-model h2', 'modelSettingsHeading');
    setText('label[for="api-key"]', 'apiKeyLabel');
    setPlaceholder('#api-key', 'apiKeyPlaceholder');
    setTitle('#toggle-api-key', 'toggleApiKeyVisibilityTitleTranslated');
    setText('label[for="model-selection"]', 'modelSelectLabelSettings');
    setText('#save-model-settings', 'save'); // Default text

    setTitle('#theme-toggle-btn', 'themeToggleTitle'); // Title for the draggable button

    // Note: Dynamic elements like agent list items, status messages, etc.,
    // need to be updated when they are created or their state changes,
    // using the _ function with the currentTranslations.
}

/**
 * 恢复发送按钮和输入框到正常状态
 * @param {object} state - Global state reference
 * @param {object} elements - DOM elements reference
 * @param {object} currentTranslations - Translations object
 * @param {function} sendUserMessageCallback - Callback to re-attach send listener
 * @param {function} abortStreamingCallback - Callback to remove abort listener
 */
export function restoreSendButtonAndInput(state, elements, currentTranslations, sendUserMessageCallback, abortStreamingCallback) {
    if (!state.isStreaming) return;

    console.log("Restoring send button and input state...");
    state.isStreaming = false;

    elements.sendMessage.classList.remove('stop-streaming');
    elements.sendMessage.title = _('sendMessageTitle', {}, currentTranslations);
    elements.sendMessage.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11v-.001ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
        </svg>
    `;

    elements.sendMessage.removeEventListener('click', abortStreamingCallback);
    elements.sendMessage.addEventListener('click', sendUserMessageCallback);

    if (window.GeminiAPI && window.GeminiAPI.currentAbortController) {
        window.GeminiAPI.currentAbortController = null;
    }
}

/**
 * 切换 API Key 可见性
 * @param {object} elements - DOM elements reference
 */
export function toggleApiKeyVisibility(elements) {
     if (!elements.toggleApiKey || !elements.apiKeyInput) return;

     const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
     elements.apiKeyInput.type = type;

     const eyeIcon = document.getElementById('eye-icon');
     const eyeSlashIcon = document.getElementById('eye-slash-icon');

     if (eyeIcon && eyeSlashIcon) {
         eyeIcon.style.display = (type === 'text') ? 'none' : 'inline-block';
         eyeSlashIcon.style.display = (type === 'text') ? 'inline-block' : 'none';
     }
}

/**
 * 在聊天界面显示状态消息 (例如内容提取成功)
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型 ('success' 或 'error')
 * @param {object} elements - DOM elements reference
 */
export function showChatStatusMessage(message, type, elements) {
    if (!elements.chatStatusMessage) return;

    elements.chatStatusMessage.textContent = message;
    elements.chatStatusMessage.className = 'chat-status ' + type;

    elements.chatStatusMessage.style.display = 'block';
    elements.chatStatusMessage.style.opacity = '1';
    elements.chatStatusMessage.style.transform = 'translateY(0)';

    if (type === 'success') {
        setTimeout(() => {
            elements.chatStatusMessage.style.opacity = '0';
            elements.chatStatusMessage.style.transform = 'translateY(5px)';
            setTimeout(() => {
                 if (elements.chatStatusMessage.textContent === message) {
                     elements.chatStatusMessage.style.display = 'none';
                 }
            }, 300);
        }, 2000);
    }
}

/**
 * 为代码块添加复制按钮
 * @param {HTMLElement} block - 代码块元素 (<pre>)
 * @param {object} currentTranslations - Translations object
 * @param {function} copyCodeToClipboardCallback - Callback to handle actual copying
 */
export function addCopyButtonToCodeBlock(block, currentTranslations, copyCodeToClipboardCallback) {
    // Avoid adding multiple buttons
    if (block.querySelector('.code-copy-button')) {
        return;
    }

    const copyButton = document.createElement('button');
    copyButton.classList.add('code-copy-button');
    copyButton.title = _('copyCode', {}, currentTranslations);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");

    const rectElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectElement.setAttribute("x", "9"); rectElement.setAttribute("y", "9");
    rectElement.setAttribute("width", "13"); rectElement.setAttribute("height", "13");
    rectElement.setAttribute("rx", "2"); rectElement.setAttribute("ry", "2");

    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");

    svg.appendChild(rectElement);
    svg.appendChild(pathElement);
    copyButton.appendChild(svg);

    copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const encodedCode = block.getAttribute('data-code');
        let codeToCopy = '';
        if (encodedCode) {
            try {
                codeToCopy = decodeURIComponent(atob(encodedCode));
            } catch (err) {
                console.error("Error decoding base64 code:", err);
                codeToCopy = block.querySelector('code')?.innerText || ''; // Fallback
            }
        } else {
            console.warn('Code block missing data-code attribute.');
            codeToCopy = block.querySelector('code')?.innerText || ''; // Fallback
        }
        copyCodeToClipboardCallback(codeToCopy, copyButton); // Use callback
    });

    block.appendChild(copyButton);
}

/**
 * 添加消息操作按钮（复制、删除、重新生成）
 * @param {HTMLElement} messageElement - 消息元素
 * @param {string} content - 消息的原始文本内容
 * @param {object} currentTranslations - Translations object
 * @param {function} copyMessageContentCallback - Callback
 * @param {function} regenerateMessageCallback - Callback
 * @param {function} deleteMessageCallback - Callback
 */
export function addMessageActionButtons(messageElement, content, currentTranslations, copyMessageContentCallback, regenerateMessageCallback, deleteMessageCallback) {
    const messageId = messageElement.dataset.messageId;
    if (!messageId) return; // Need ID for actions

    if (messageElement.querySelector('.message-actions')) {
        return; // Avoid duplicate buttons
    }

    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';

    const buttonsToAppend = [];

    // Copy Button
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button'); // Use base class
    copyButton.title = _('copyAll', {}, currentTranslations);
    copyButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
    `;
    copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        copyMessageContentCallback(messageElement, content, copyButton); // Use callback
    });
    buttonsToAppend.push(copyButton);

    // Regenerate Button
    const regenerateButton = document.createElement('button');
    regenerateButton.className = 'message-action-btn regenerate-btn';
    regenerateButton.title = _('regenerate', {}, currentTranslations);
    regenerateButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
    `;
    regenerateButton.addEventListener('click', (e) => {
        e.stopPropagation();
        regenerateMessageCallback(messageId); // Use callback
    });
    buttonsToAppend.push(regenerateButton);

    // Delete Button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'message-action-btn delete-btn';
    deleteButton.title = _('deleteMessage', {}, currentTranslations);
    deleteButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
    `;
    deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessageCallback(messageId); // Use callback
    });
    buttonsToAppend.push(deleteButton);

    buttonsToAppend.forEach(button => messageActions.appendChild(button));
    messageElement.appendChild(messageActions);
}

/**
 * 复制代码块内容到剪贴板 (UI Feedback part)
 * @param {HTMLElement} buttonElement - 复制按钮元素
 */
export function showCopyCodeFeedback(buttonElement) {
    const originalHTML = buttonElement.innerHTML;
    // Use a simpler checkmark SVG for feedback
    buttonElement.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#34a853" viewBox="0 0 16 16">
        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
      </svg>
    `;
    buttonElement.disabled = true; // Briefly disable

    setTimeout(() => {
        buttonElement.innerHTML = originalHTML;
        buttonElement.disabled = false;
    }, 1500); // Shorter feedback duration
}

/**
 * 复制消息内容到剪贴板 (UI Feedback part)
 * @param {HTMLElement} buttonElement - 复制按钮元素
 */
export function showCopyMessageFeedback(buttonElement) {
    const originalSVG = buttonElement.querySelector('svg');
    if (!originalSVG) return; // Safety check

    const newSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    newSVG.setAttribute("viewBox", "0 0 24 24");
    newSVG.setAttribute("width", "14");
    newSVG.setAttribute("height", "14");
    newSVG.setAttribute("fill", "none");
    newSVG.setAttribute("stroke", "#34a853"); // Green checkmark
    newSVG.setAttribute("stroke-width", "2");

    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", "M20 6L9 17l-5-5");
    newSVG.appendChild(pathElement);

    const originalSVGCopy = originalSVG.cloneNode(true);
    buttonElement.replaceChild(newSVG, originalSVG);
    buttonElement.disabled = true; // Briefly disable

    setTimeout(() => {
        // Check if the button still exists and has the checkmark before restoring
        if (buttonElement.contains(newSVG)) {
             buttonElement.replaceChild(originalSVGCopy, newSVG);
        }
        buttonElement.disabled = false;
    }, 1500);
}