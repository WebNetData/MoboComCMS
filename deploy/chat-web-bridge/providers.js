// Public DOM adapters only; all session data stays in the browser profile.
globalThis.mobocomWebProviders = {
 chatgpt:{origin:'https://chatgpt.com',url:'https://chatgpt.com/'},
 gemini:{origin:'https://gemini.google.com',url:'https://gemini.google.com/app',fresh:/^\/app\/?$/,input:'rich-textarea [contenteditable="true"],textarea[aria-label]',turns:'model-response',existing:'model-response,user-query',send:'button.send-button,button[aria-label="Send message"],button[aria-label="Send"]'},
 qwen:{origin:'https://chat.qwen.ai',url:'https://chat.qwen.ai/',fresh:/^\/$/,input:'textarea,[role="textbox"][contenteditable="true"]',turns:'[data-message-author-role="assistant"],.assistant-message',existing:'[data-message-author-role],.assistant-message,.user-message',send:'button[type="submit"],button[aria-label="Send"],button[aria-label="Send message"],button[data-testid="send-message-button"]'},
 deepseek:{origin:'https://chat.deepseek.com',url:'https://chat.deepseek.com/',fresh:/^\/$/,input:'textarea,[role="textbox"][contenteditable="true"]',turns:'.ds-markdown',existing:'.ds-markdown,[data-message-author-role]',send:'button[type="submit"],button[aria-label="Send"],button[aria-label="Send message"],[role="button"][aria-label="Send message"],[data-testid="send-button"]'}
}
