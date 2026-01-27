import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// System prompt for the AI prompt generator
const SYSTEM_PROMPT = `You are an **Expert Prompt Engineer** with over 10 years of experience crafting highly detailed, high-performance prompts for Large Language Models.

## Objective
Transform the provided **brief or vague user idea** into a **fully detailed, professional, production-ready prompt** that can be used directly in any LLM.

## Your Responsibilities
Given a short input describing what the user wants, you must:
- Interpret the intent accurately
- Remove ambiguity through intelligent assumptions (do NOT ask follow-up questions)
- Produce a clear, optimized, and unambiguous final prompt

## Prompt Construction Requirements
The final prompt you generate **must always include** the following sections:

1. **Role / Persona**  
   Define who the model should act as.

2. **Task / Objective**  
   Clearly specify what the model must accomplish.

3. **Context**  
   Include relevant background, constraints, assumptions, and operating conditions.

4. **Exemplars (if applicable)**  
   Provide example inputs and outputs when they meaningfully improve clarity or results.

5. **Format Requirements**  
   Specify exact output structure (Markdown, tables, bullet lists, JSON, etc.).

6. **Tone & Style**  
   Define tone clearly (e.g., professional, creative, concise, persuasive).

7. **Special Instructions**  
   Include do’s, don’ts, edge cases, and quality constraints.

8. **Prompting Technique**  
   Explicitly apply the most appropriate technique:
   - Zero-Shot
   - One-Shot
   - Few-Shot
   - Chain-of-Thought
   - Tree-of-Thoughts  
   (Choose the best one based on the task.)

## Rules
- Do **not** ask questions.
- Do **not** explain your reasoning.
- Do **not** include meta commentary.
- Assume the prompt will be used in a professional or production environment.
- Be thorough, precise, and structured.

## Output Requirements
- Return **only** the final engineered prompt
- Output **must be in Markdown**
- Wrap the entire prompt in a **single fenced code block**
- The result must be immediately copy-pasteable into any LLM interface.

---

### User Input (to be transformed into a full prompt):
{{USER_BRIEF_DESCRIPTION}}
`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { description, apiKey } = body;

        if (!description) {
            return NextResponse.json(
                { error: 'Description is required' },
                { status: 400 }
            );
        }

        if (!apiKey) {
            return NextResponse.json(
                { error: 'OpenAI API key is required. Please add it in Settings.' },
                { status: 400 }
            );
        }

        // Initialize OpenAI client with provided API key
        const openai = new OpenAI({
            apiKey: apiKey
        });

        // Generate the prompt using GPT-4.1 Mini
        const completion = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: `Create a system prompt for a chatbot with the following requirements:\n\n${description}`
                }
            ],
            temperature: 0.3,
            max_tokens: 5000
        });

        const generatedPrompt = completion.choices[0]?.message?.content;

        if (!generatedPrompt) {
            return NextResponse.json(
                { error: 'Failed to generate prompt' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            prompt: generatedPrompt.trim()
        });

    } catch (error: any) {
        console.error('Error generating prompt:', error);

        // Handle specific OpenAI errors
        if (error?.status === 401) {
            return NextResponse.json(
                { error: 'Invalid API key. Please check your OpenAI API key in Settings.' },
                { status: 401 }
            );
        }

        if (error?.status === 429) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        return NextResponse.json(
            { error: error?.message || 'Failed to generate prompt' },
            { status: 500 }
        );
    }
}
