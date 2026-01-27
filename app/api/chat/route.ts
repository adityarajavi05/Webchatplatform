import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { callLLM } from '@/lib/llm';
import { decrypt } from '@/lib/crypto';
import { getIntentsForChatbot, classifyMessageIntent } from '@/lib/intent-detector';

export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function cors(res: NextResponse) {
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res;
}

// Check if message matches any escalation rules using AI
async function checkEscalationRules(
    message: string,
    rules: Array<{ name: string; description: string; brief_response?: string }>,
    apiKey: string,
    provider: string,
    model: string
): Promise<{ matched: boolean; rule?: { name: string; description: string; brief_response?: string } }> {
    if (!rules || rules.length === 0) {
        return { matched: false };
    }

    const ruleDescriptions = rules.map((r, i) => `${i + 1}. "${r.name}": ${r.description}`).join('\n');

    const classificationPrompt = `You are a message classifier. Analyze if the user's message relates to any of these topics that require human assistance:

${ruleDescriptions}

User message: "${message}"

If the message relates to ANY of the topics above, respond with ONLY the rule number (e.g., "1" or "2").
If the message does NOT relate to any topic, respond with "none".
Do not explain, just respond with the number or "none".`;

    try {
        const response = await callLLM(
            provider,
            apiKey,
            model,
            [{ role: 'user', content: classificationPrompt }],
            ''
        );

        const result = response?.trim().toLowerCase();
        console.log(`[Escalation] AI classification result: "${result}" for message: "${message.substring(0, 50)}..."`);

        if (result === 'none' || !result) {
            return { matched: false };
        }

        // Try to parse the rule number
        const ruleIndex = parseInt(result) - 1;
        if (!isNaN(ruleIndex) && ruleIndex >= 0 && ruleIndex < rules.length) {
            return { matched: true, rule: rules[ruleIndex] };
        }

        return { matched: false };
    } catch (error) {
        console.error('[Escalation] AI classification error:', error);
        return { matched: false };
    }
}

export async function POST(req: NextRequest) {
    try {
        const { conversationId, message, embedCode } = await req.json();

        // Get chatbot config
        const { data: chatbot, error: chatbotError } = await supabase
            .from('chatbots')
            .select('*')
            .eq('embed_code', embedCode)
            .single();

        if (chatbotError || !chatbot) {
            return cors(NextResponse.json(
                { success: false, error: 'Chatbot not found' },
                { status: 404 }
            ));
        }

        const decryptedApiKey = decrypt(chatbot.api_key);

        // Get message history
        const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at')
            .limit(20);

        // Classify user message intent (async, non-blocking)
        let detectedIntentId: string | null = null;
        try {
            const intents = await getIntentsForChatbot(chatbot.id);
            console.log(`[Intent] Found ${intents.length} intents for chatbot ${chatbot.id}`);
            if (intents.length > 0) {
                detectedIntentId = await classifyMessageIntent(
                    message,
                    intents,
                    decryptedApiKey,
                    chatbot.llm_provider,
                    chatbot.model_name
                );
                console.log(`[Intent] Classified message "${message.substring(0, 50)}..." as intent ID: ${detectedIntentId}`);
            }
        } catch (intentError) {
            console.log('Intent classification skipped:', intentError);
        }

        // Save user message with intent
        await supabaseAdmin.from('messages').insert({
            conversation_id: conversationId,
            sender: 'user',
            sender_type: 'user',
            content: message,
            detected_intent_id: detectedIntentId
        });

        // Update conversation message count
        await supabaseAdmin
            .from('conversations')
            .update({ total_messages: (messages?.length || 0) + 1 })
            .eq('id', conversationId);

        // Check escalation rules using AI
        const escalationRules = chatbot.escalation_rules || [];
        let isEscalated = false;
        let botResponse: string = '';

        if (escalationRules.length > 0) {
            const escalationCheck = await checkEscalationRules(
                message,
                escalationRules,
                decryptedApiKey,
                chatbot.llm_provider,
                chatbot.model_name
            );

            if (escalationCheck.matched && escalationCheck.rule) {
                console.log(`[Escalation] Message matched rule: "${escalationCheck.rule.name}"`);
                isEscalated = true;

                // Generate brief response
                const briefResponse = escalationCheck.rule.brief_response ||
                    `I understand you have a question about ${escalationCheck.rule.name.toLowerCase().replace(/_/g, ' ')}.`;

                botResponse = `${briefResponse}\n\nI'm not able to answer that accurately right now. I'm forwarding this to a human agent who can help. Please wait, someone will respond shortly.`;

                // Update conversation for human support
                await supabaseAdmin
                    .from('conversations')
                    .update({
                        requires_human_support: true,
                        human_support_status: 'pending',
                        escalated_at: new Date().toISOString(),
                        escalation_reason: `Matched rule: ${escalationCheck.rule.name}`
                    })
                    .eq('id', conversationId);
            }
        }

        // If not escalated, generate normal response
        if (!isEscalated) {
            // Format for LLM
            const formattedMessages = (messages || []).map((m) => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content
            }));
            formattedMessages.push({ role: 'user', content: message });

            // RAG: Get relevant context from knowledge base
            let ragContext = '';
            try {
                const { searchSimilarChunks } = await import('@/lib/document-processor');
                const relevantChunks = await searchSimilarChunks(chatbot.id, message, 5);

                if (relevantChunks.length > 0) {
                    ragContext = '\n\n### Relevant Knowledge Base Context:\n' +
                        relevantChunks.map((chunk, i) => {
                            if (chunk.page_url && chunk.page_title) {
                                return `[${i + 1}] From page "${chunk.page_title}" (${chunk.page_url}):\n${chunk.content}`;
                            }
                            return `[${i + 1}] ${chunk.content}`;
                        }).join('\n\n');
                }
            } catch (ragError) {
                console.log('RAG context retrieval skipped:', ragError);
            }

            // Augment system prompt with RAG context
            const augmentedSystemPrompt = ragContext
                ? `${chatbot.system_prompt}\n\nUse the following knowledge base context to answer questions when relevant. When referencing information from specific pages, you can mention the page name to help users navigate:${ragContext}`
                : chatbot.system_prompt;

            // Call LLM
            try {
                botResponse = await callLLM(
                    chatbot.llm_provider,
                    decryptedApiKey,
                    chatbot.model_name,
                    formattedMessages,
                    augmentedSystemPrompt
                );
            } catch (llmError) {
                console.error('LLM Error:', llmError);
                botResponse = "I'm sorry, I encountered an error processing your request. Please try again.";
            }
        }

        // Save bot response
        const { data: botMessage } = await supabaseAdmin
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender: 'bot',
                sender_type: 'bot',
                content: botResponse
            })
            .select()
            .single();

        return cors(NextResponse.json({
            success: true,
            message: botMessage,
            isEscalated
        }));
    } catch (err) {
        console.error('Chat API Error:', err);
        return cors(NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        ));
    }
}

