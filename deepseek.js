const DEEPSEEK_API_KEY = 'sk-6b17e3f2ff354b01b7eb0ec02bc4cd46';
const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1';

class DeepseekAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.endpoint = DEEPSEEK_API_ENDPOINT;
        // 在类内部定义提示词模板
        this.prompts = {
            chat: {
                default: '请根据上下文提供专业、准确的回答。',
                study: {
                    default: '请提供关于该地区的小学地理知识点。100字以内。',
                    beginner: '请提供适合初中生的地理知识点。200字以内。',
                    advanced: '请提供适合高中生的地理知识点。300字以内。',
                    practical: '请提供适合大学生的地理知识点。500字以内。',
                    professional: '请提供适合研究生的地理知识点。1000字以内。'
                }
            }
        };
    }

    // 修改提示词处理方法
    _processPrompt(type, style, content) {
        const categoryTemplates = this.prompts[type] || {};
        let template = '';

        // 处理嵌套的提示词模板
        if (type === 'chat' && style.startsWith('study')) {
            const studyTemplates = categoryTemplates.study || {};
            template = studyTemplates[style] || studyTemplates.default || '';
        } else {
            template = categoryTemplates[style] || categoryTemplates.default || '';
        }

        return `${template}${content}`;
    }

    async chat(messages, style = 'default') {
        try {
            // 处理消息中的提示词
            const processedMessages = messages.map(msg => {
                if (msg.role === 'user') {
                    return {
                        ...msg,
                        content: this._processPrompt('chat', style, msg.content)
                    };
                }
                return msg;
            });

            const response = await fetch(`${this.endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: processedMessages
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Deepseek API 调用出错:', error);
            throw error;
        }
    }

    async generateImage(prompt, style = 'default') {
        try {
            // 处理图像生成提示词
            const processedPrompt = this._processPrompt('image', style, prompt);
            
            const response = await fetch(`${this.endpoint}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    prompt: processedPrompt,
                    n: 1,
                    size: '1024x1024'
                })
            });

            if (!response.ok) {
                throw new Error(`图像生成请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('图像生成出错:', error);
            throw error;
        }
    }

    // 获取可用的提示词模板
    getAvailablePrompts(type) {
        return Object.keys(this.prompts[type] || {});
    }
}

// 导出 API 实例
export const deepseek = new DeepseekAPI(DEEPSEEK_API_KEY);
