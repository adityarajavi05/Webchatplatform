import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';

export interface DetectedIntent {
    name: string;
    description: string;
    keywords: string[];
}

export interface StoredIntent extends DetectedIntent {
    id: string;
    chatbot_id: string;
    color: string;
    is_active: boolean;
    message_count: number;
}

// System prompt for intent detection
const INTENT_DETECTION_PROMPT = `You are an expert at analyzing content and identifying user intents.

Given the following content from a website or document, identify 5-10 distinct user intents that visitors might have.

For each intent, provide:
- name: A short, clear name (e.g., "Loan Inquiry", "Account Balance", "Product Pricing")
- description: What the user is trying to accomplish (1-2 sentences)
- keywords: 3-5 trigger words or phrases that indicate this intent

IMPORTANT:
- Focus on actionable intents (questions users would ask)
- Be specific to the content provided
- Avoid generic intents like "General Question"

Return ONLY a valid JSON array, no other text.

Example format:
[
  {
    "name": "Loan Inquiry",
    "description": "User wants information about loan options, eligibility, or application process",
    "keywords": ["loan", "borrow", "interest rate", "EMI", "eligibility"]
  }
]

Content to analyze:
`;

// System prompt for intent classification
const INTENT_CLASSIFICATION_PROMPT = `You are a precise intent classifier. Given a user message and a list of possible intents, determine which intent best matches the message.

Rules:
- Return ONLY the exact intent name that best matches
- If no intent matches well, return "other"
- Do not explain, just return the intent name

Available intents:
`;

/**
 * Detect intents from content using the chatbot's configured LLM
 */
export async function detectIntentsFromContent(
    content: string,
    apiKey: string,
    provider: string = 'openai',
    model: string = 'gpt-4.1-mini',
    maxIntents: number = 10
): Promise<DetectedIntent[]> {
    const { callLLM } = await import('@/lib/llm');

    // Sample content if too long (take beginning, middle, end)
    const maxContentLength = 8000;
    let sampledContent = content;

    if (content.length > maxContentLength) {
        const chunkSize = Math.floor(maxContentLength / 3);
        const beginning = content.slice(0, chunkSize);
        const middle = content.slice(
            Math.floor(content.length / 2) - chunkSize / 2,
            Math.floor(content.length / 2) + chunkSize / 2
        );
        const end = content.slice(-chunkSize);
        sampledContent = `${beginning}\n\n[...]\n\n${middle}\n\n[...]\n\n${end}`;
    }

    const responseText = await callLLM(
        provider,
        apiKey,
        model,
        [{ role: 'user', content: INTENT_DETECTION_PROMPT + sampledContent }],
        ''
    );

    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = responseText || '[]';
        const jsonMatch = responseText?.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        const intents = JSON.parse(jsonStr) as DetectedIntent[];
        return intents.slice(0, maxIntents);
    } catch (error) {
        console.error('Failed to parse intents:', error, responseText);
        return [];
    }
}

/**
 * Classify a user message against known intents
 * Uses the same LLM provider as the chatbot
 */
export async function classifyMessageIntent(
    message: string,
    intents: StoredIntent[],
    apiKey: string,
    provider: string = 'openai',
    model: string = 'gpt-4.1-mini'
): Promise<string | null> {
    if (intents.length === 0) return null;

    const { callLLM } = await import('@/lib/llm');

    const intentList = intents
        .map(i => `- ${i.name}: ${i.description}`)
        .join('\n');

    const systemPrompt = INTENT_CLASSIFICATION_PROMPT + intentList;
    const userMessage = `Classify this message: "${message}"`;

    const response = await callLLM(
        provider,
        apiKey,
        model,
        [{ role: 'user', content: userMessage }],
        systemPrompt
    );

    const intentName = response?.trim() || 'other';

    console.log(`[Intent Classifier] LLM returned: "${intentName}"`);

    // Find matching intent (case-insensitive, also try partial match)
    let matchedIntent = intents.find(
        i => i.name.toLowerCase() === intentName.toLowerCase()
    );

    // If no exact match, try to find a partial match
    if (!matchedIntent && intentName !== 'other') {
        matchedIntent = intents.find(
            i => i.name.toLowerCase().includes(intentName.toLowerCase()) ||
                intentName.toLowerCase().includes(i.name.toLowerCase())
        );
    }

    console.log(`[Intent Classifier] Matched intent: ${matchedIntent?.name || 'none'} (id: ${matchedIntent?.id || 'null'})`);

    return matchedIntent?.id || null;
}

/**
 * Store detected intents in database
 */
export async function storeIntents(
    chatbotId: string,
    intents: DetectedIntent[]
): Promise<StoredIntent[]> {
    // Generate colors for intents
    const colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
    ];

    const records = intents.map((intent, index) => ({
        chatbot_id: chatbotId,
        name: intent.name,
        description: intent.description,
        keywords: intent.keywords,
        color: colors[index % colors.length],
        is_active: true
    }));

    const { data, error } = await supabaseAdmin
        .from('chatbot_intents')
        .insert(records)
        .select();

    if (error) {
        console.error('Failed to store intents:', error);
        throw error;
    }

    return data as StoredIntent[];
}

/**
 * Get intents for a chatbot
 */
export async function getIntentsForChatbot(chatbotId: string): Promise<StoredIntent[]> {
    const { data, error } = await supabaseAdmin
        .from('chatbot_intents')
        .select('*')
        .eq('chatbot_id', chatbotId)
        .eq('is_active', true)
        .order('message_count', { ascending: false });

    if (error) {
        console.error('Failed to fetch intents:', error);
        return [];
    }

    return data as StoredIntent[];
}

/**
 * Delete all intents for a chatbot (for re-detection)
 */
export async function clearIntentsForChatbot(chatbotId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('chatbot_intents')
        .delete()
        .eq('chatbot_id', chatbotId);

    if (error) {
        console.error('Failed to clear intents:', error);
        throw error;
    }
}

/**
 * Get intent analytics for a chatbot
 */
export async function getIntentAnalytics(chatbotId: string): Promise<{
    intents: Array<{ name: string; count: number; color: string; percentage: number }>;
    totalClassified: number;
}> {
    const intents = await getIntentsForChatbot(chatbotId);

    const totalClassified = intents.reduce((sum, i) => sum + (i.message_count || 0), 0);

    return {
        intents: intents.map(i => ({
            name: i.name,
            count: i.message_count || 0,
            color: i.color,
            percentage: totalClassified > 0
                ? Math.round((i.message_count || 0) / totalClassified * 100)
                : 0
        })),
        totalClassified
    };
}

/**
 * Trigger automatic intent detection for a chatbot
 * Called after knowledge base upload/indexing completes
 */
export async function triggerIntentDetection(chatbotId: string): Promise<void> {
    // Fetch chatbot to get API key and provider
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
        .from('chatbots')
        .select('api_key, llm_provider, model_name')
        .eq('id', chatbotId)
        .single();

    if (chatbotError || !chatbot || !chatbot.api_key) {
        console.log('[Intent] No API key configured, skipping auto-detection');
        return;
    }

    // Decrypt API key
    const { decrypt } = await import('@/lib/crypto');
    const apiKey = decrypt(chatbot.api_key);
    const provider = chatbot.llm_provider || 'openai';
    const model = chatbot.model_name || 'gpt-4.1-mini';

    // Clear existing intents for fresh detection
    await clearIntentsForChatbot(chatbotId);

    // Fetch content from document chunks
    const { data: chunks } = await supabaseAdmin
        .from('document_chunks')
        .select('content')
        .eq('chatbot_id', chatbotId)
        .limit(50);

    if (!chunks || chunks.length === 0) {
        console.log('[Intent] No content available for intent detection');
        return;
    }

    const contentToAnalyze = chunks.map(c => c.content).join('\n\n');

    if (contentToAnalyze.length < 100) {
        console.log('[Intent] Content too short for intent detection');
        return;
    }

    // Detect intents
    const detectedIntents = await detectIntentsFromContent(contentToAnalyze, apiKey, provider, model);

    if (detectedIntents.length === 0) {
        console.log('[Intent] No intents detected from content');
        return;
    }

    // Store intents
    await storeIntents(chatbotId, detectedIntents);
    console.log(`[Intent] Auto-detected ${detectedIntents.length} intents for chatbot ${chatbotId}`);
}
