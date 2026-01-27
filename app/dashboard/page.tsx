'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

interface Chatbot {
    id: string;
    name: string;
    llm_provider: string;
    model_name: string;
    created_at: string;
    primary_color: string;
    embed_code: string;
    system_prompt: string;
    welcome_message: string;
}

interface Message {
    id: string;
    sender: string;
    content: string;
    created_at: string;
}

interface Conversation {
    id: string;
    visitor_id: string;
    started_at: string;
    ended_at?: string;
    status?: string;
    page_url?: string;
    total_messages: number;
    messages?: Message[];
}

interface WidgetEvent {
    id: string;
    event_type: string;
    page_url: string;
    created_at: string;
}

interface HourlyData {
    hour: number;
    count: number;
}

interface WordCount {
    word: string;
    count: number;
}

interface PageEngagement {
    page_url: string;
    visits: number;
    conversations: number;
}

interface BotAnalytics {
    total_conversations: number;
    total_messages: number;
    avg_messages: number;
    conversations: Conversation[];
    events: WidgetEvent[];
    hourlyData: HourlyData[];
    wordCloud: WordCount[];
    pageEngagement: PageEngagement[];
    completedConversations: number;
    openConversations: number;
    abandonedConversations: number;
}

interface Document {
    id: string;
    filename: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    status: 'processing' | 'ready' | 'error';
    chunk_count: number;
    error_message?: string;
    created_at: string;
}

interface DocumentUsage {
    documentCount: number;
    maxDocuments: number;
    totalSize: number;
    maxTotalSize: number;
    maxFileSize: number;
    plan: string;
}

interface WebsitePage {
    id: string;
    url: string;
    title: string;
    status: string;
    last_crawled_at: string;
    error_message?: string;
}

interface WebsiteSource {
    id: string;
    url: string;
    crawl_status: string;
    page_count: number;
    last_crawl_at: string;
    error_message?: string;
}

interface WebsiteUsage {
    pageCount: number;
    maxPages: number;
}

export default function DashboardPage() {
    const [chatbots, setChatbots] = useState<Chatbot[]>([]);
    const [selectedBot, setSelectedBot] = useState<Chatbot | null>(null);
    const [analytics, setAnalytics] = useState<Record<string, BotAnalytics>>({});
    const [loading, setLoading] = useState(true);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [copied, setCopied] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

    // Settings Modal State
    const [showSettings, setShowSettings] = useState(false);
    const [editingBot, setEditingBot] = useState<Chatbot | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        system_prompt: '',
        welcome_message: '',
        primary_color: '#3B82F6',
        model_name: '',
        llm_provider: '',
        plan: 'basic',
        escalation_rules: [] as Array<{ name: string; description: string; brief_response: string }>
    });

    // Knowledge Base State
    const [documents, setDocuments] = useState<Document[]>([]);
    const [documentUsage, setDocumentUsage] = useState<DocumentUsage | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);

    // Website Source State
    const [kbMode, setKbMode] = useState<'documents' | 'website'>('documents');
    const [websiteSource, setWebsiteSource] = useState<WebsiteSource | null>(null);
    const [websitePages, setWebsitePages] = useState<WebsitePage[]>([]);
    const [websiteUsage, setWebsiteUsage] = useState<WebsiteUsage | null>(null);
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [sitemapFile, setSitemapFile] = useState<File | null>(null);
    const [indexing, setIndexing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Intent Analytics State (stored per bot id for persistence)
    const [intentAnalyticsCache, setIntentAnalyticsCache] = useState<Record<string, {
        intents: Array<{ name: string; count: number; color: string; percentage: number }>;
        totalClassified: number;
    }>>({});
    const [detectingIntents, setDetectingIntents] = useState(false);

    // Auth context
    const { user, signOut, loading: authLoading } = useAuth();

    // Get current bot's intent analytics
    const intentAnalytics = selectedBot ? intentAnalyticsCache[selectedBot.id] || null : null;

    useEffect(() => {
        if (!user) return; // Wait for auth

        async function fetchChatbots() {
            const userId = user?.id;
            if (!userId) return;

            const { data } = await supabase
                .from('chatbots')
                .select('*')
                .eq('user_id', userId) // Filter by current user
                .order('created_at', { ascending: false });

            if (data && data.length > 0) {
                setChatbots(data);
                setSelectedBot(data[0]);
            }
            setLoading(false);
        }
        fetchChatbots();
    }, [user]);

    useEffect(() => {
        if (!selectedBot) return;

        // Check if we already have analytics for this bot
        if (analytics[selectedBot.id]) return;

        fetchBotAnalytics(selectedBot);
    }, [selectedBot]);

    async function fetchBotAnalytics(bot: Chatbot) {
        setLoadingAnalytics(true);

        // Fetch conversations with messages
        const { data: convData } = await supabase
            .from('conversations')
            .select('*, messages(*)')
            .eq('chatbot_id', bot.id)
            .order('started_at', { ascending: false })
            .limit(100);

        const conversations = convData || [];

        // Fetch widget events
        const { data: eventsData } = await supabase
            .from('widget_events')
            .select('*')
            .eq('chatbot_id', bot.id)
            .order('created_at', { ascending: false })
            .limit(500);

        const events = eventsData || [];

        // Process analytics
        const processed = processAnalytics(conversations, events);

        setAnalytics(prev => ({
            ...prev,
            [bot.id]: {
                ...processed,
                conversations,
                events
            }
        }));

        // Fetch intent analytics
        try {
            const intentRes = await fetch(`/api/intents?chatbotId=${bot.id}&analytics=true`);
            const intentData = await intentRes.json();
            if (intentData.success) {
                setIntentAnalyticsCache(prev => ({
                    ...prev,
                    [bot.id]: intentData
                }));
            }
        } catch (error) {
            console.log('Intent analytics fetch skipped:', error);
        }

        setLoadingAnalytics(false);
    }

    function processAnalytics(convs: Conversation[], evts: WidgetEvent[]) {
        // Calculate stats
        const totalConversations = convs.length;
        const totalMessages = convs.reduce((sum, c) => sum + (c.messages?.length || 0), 0);
        const avgMessages = totalConversations > 0 ? (totalMessages / totalConversations).toFixed(1) : '0';

        const completedConversations = convs.filter(c => c.status === 'completed' || (c.messages?.length || 0) >= 4).length;
        const abandonedConversations = convs.filter(c => c.status === 'closed' || c.status === 'abandoned').length;
        const openConversations = convs.filter(c => c.status === 'open' || !c.status).length;

        // Peak engagement hours
        const hourCounts: Record<number, number> = {};
        evts.forEach(e => {
            const hour = new Date(e.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const hourlyData: HourlyData[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: hourCounts[i] || 0
        }));

        // Word cloud
        const wordCounts: Record<string, number> = {};
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'but', 'if', 'or', 'i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'they', 'them', 'this', 'that', 'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'okay', 'ok']);

        convs.forEach(conv => {
            conv.messages?.forEach(msg => {
                if (msg.sender === 'user') {
                    const words = msg.content.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
                    words.forEach(word => {
                        if (word.length > 2 && !stopWords.has(word)) {
                            wordCounts[word] = (wordCounts[word] || 0) + 1;
                        }
                    });
                }
            });
        });

        const wordCloud: WordCount[] = Object.entries(wordCounts)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);

        // Page engagement
        const pageStats: Record<string, { visits: number; conversations: number }> = {};
        evts.forEach(e => {
            if (e.page_url) {
                try {
                    const url = new URL(e.page_url).pathname;
                    if (!pageStats[url]) {
                        pageStats[url] = { visits: 0, conversations: 0 };
                    }
                    if (e.event_type === 'widget_opened') {
                        pageStats[url].visits++;
                    }
                } catch (err) {
                    // Invalid URL
                }
            }
        });
        convs.forEach(conv => {
            if (conv.page_url) {
                try {
                    const url = new URL(conv.page_url).pathname;
                    if (pageStats[url]) {
                        pageStats[url].conversations++;
                    }
                } catch (e) {
                    // Invalid URL
                }
            }
        });

        const pageEngagement: PageEngagement[] = Object.entries(pageStats)
            .map(([page_url, stats]) => ({ page_url, ...stats }))
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 10);

        return {
            total_conversations: totalConversations,
            total_messages: totalMessages,
            avg_messages: parseFloat(avgMessages),
            hourlyData,
            wordCloud,
            pageEngagement,
            completedConversations,
            openConversations,
            abandonedConversations
        };
    }

    const copyToClipboard = () => {
        if (!selectedBot) return;
        const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const code = `<script src="${appUrl}/widget.js" data-chatbot-id="${selectedBot.embed_code}" async></script>`;
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Open settings modal for a chatbot
    const openSettings = (bot: Chatbot, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selecting the bot
        setEditingBot(bot);
        setEditForm({
            name: bot.name,
            system_prompt: bot.system_prompt || '',
            welcome_message: bot.welcome_message || '',
            primary_color: bot.primary_color || '#3B82F6',
            model_name: bot.model_name || '',
            llm_provider: bot.llm_provider || '',
            plan: 'basic',
            escalation_rules: (bot as any).escalation_rules || []
        });
        setShowSettings(true);
    };

    // Escalation rule helpers
    const addEscalationRule = () => {
        setEditForm({
            ...editForm,
            escalation_rules: [...editForm.escalation_rules, { name: '', description: '', brief_response: '' }]
        });
    };

    const updateEscalationRule = (index: number, field: string, value: string) => {
        const newRules = [...editForm.escalation_rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setEditForm({ ...editForm, escalation_rules: newRules });
    };

    const removeEscalationRule = (index: number) => {
        setEditForm({
            ...editForm,
            escalation_rules: editForm.escalation_rules.filter((_, i) => i !== index)
        });
    };

    // Save chatbot settings
    const saveSettings = async () => {
        if (!editingBot) return;
        setSaving(true);

        try {
            const response = await fetch(`/api/chatbots/${editingBot.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update chatbot');
            }

            // Update local state
            setChatbots(chatbots.map(bot =>
                bot.id === editingBot.id ? { ...bot, ...editForm } : bot
            ));

            // Update selected bot if it's the one being edited
            if (selectedBot?.id === editingBot.id) {
                setSelectedBot({ ...selectedBot, ...editForm });
            }

            setShowSettings(false);
            setEditingBot(null);
        } catch (error: any) {
            console.error('Error saving chatbot:', error);
            alert(error.message || 'Failed to save chatbot');
        } finally {
            setSaving(false);
        }
    };

    // Delete chatbot
    const deleteChatbot = async () => {
        if (!editingBot) return;
        setDeleting(true);

        try {
            const response = await fetch(`/api/chatbots/${editingBot.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete chatbot');
            }

            // Remove from local state
            setChatbots(chatbots.filter(bot => bot.id !== editingBot.id));

            // Clear selection if deleted bot was selected
            if (selectedBot?.id === editingBot.id) {
                setSelectedBot(null);
            }

            setShowSettings(false);
            setShowDeleteConfirm(false);
            setEditingBot(null);
        } catch (error: any) {
            console.error('Error deleting chatbot:', error);
            alert(error.message || 'Failed to delete chatbot');
        } finally {
            setDeleting(false);
        }
    };

    // Fetch documents for selected chatbot
    const fetchDocuments = async (chatbotId: string) => {
        try {
            const response = await fetch(`/api/documents?chatbotId=${chatbotId}`);
            const data = await response.json();

            if (data.success) {
                setDocuments(data.documents);
                setDocumentUsage(data.usage);
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
        }
    };

    // Upload document
    const uploadDocument = async (file: File) => {
        if (!selectedBot) return;

        setUploading(true);
        setUploadProgress('Uploading...');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chatbotId', selectedBot.id);

            const response = await fetch('/api/documents', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            setUploadProgress('Processing document...');

            // Refresh document list
            await fetchDocuments(selectedBot.id);
            setUploadProgress('');
        } catch (error: any) {
            console.error('Upload error:', error);
            alert(error.message || 'Failed to upload document');
            setUploadProgress('');
        } finally {
            setUploading(false);
        }
    };

    // Delete document
    const deleteDocument = async (documentId: string) => {
        if (!selectedBot) return;

        if (!confirm('Are you sure you want to delete this document?')) return;

        try {
            const response = await fetch(`/api/documents?id=${documentId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete document');
            }

            // Refresh document list
            await fetchDocuments(selectedBot.id);
        } catch (error: any) {
            console.error('Delete error:', error);
            alert(error.message || 'Failed to delete document');
        }
    };

    // Format file size
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    // Load documents when Knowledge Base is opened
    useEffect(() => {
        if (showKnowledgeBase && selectedBot) {
            fetchDocuments(selectedBot.id);
            fetchWebsiteSource(selectedBot.id);
        }
    }, [showKnowledgeBase, selectedBot]);

    // Fetch website source for selected chatbot
    const fetchWebsiteSource = async (chatbotId: string) => {
        try {
            const response = await fetch(`/api/website?chatbotId=${chatbotId}`);
            const data = await response.json();

            if (data.success) {
                setWebsiteSource(data.source);
                setWebsitePages(data.pages || []);
                setWebsiteUsage(data.usage);
                if (data.source) {
                    setKbMode('website');
                }
            }
        } catch (error) {
            console.error('Error fetching website source:', error);
        }
    };

    // Start website indexing
    const startWebsiteIndexing = async () => {
        if (!selectedBot || (!websiteUrl && !sitemapFile)) return;

        setIndexing(true);
        try {
            let body: any = { chatbotId: selectedBot.id };

            if (sitemapFile) {
                const content = await sitemapFile.text();
                body.sitemapContent = content;
                body.inputType = 'sitemap';
                body.url = websiteUrl || 'uploaded-sitemap';
            } else {
                body.url = websiteUrl;
                body.inputType = 'url';
            }

            const response = await fetch('/api/website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start indexing');
            }

            setWebsiteSource(data.source);
            setWebsiteUrl('');
            setSitemapFile(null);

            // Poll for status updates
            pollWebsiteStatus(selectedBot.id);

        } catch (error: any) {
            console.error('Indexing error:', error);
            alert(error.message || 'Failed to start indexing');
        } finally {
            setIndexing(false);
        }
    };

    // Poll website crawl status
    const pollWebsiteStatus = async (chatbotId: string) => {
        const poll = async () => {
            const response = await fetch(`/api/website?chatbotId=${chatbotId}`);
            const data = await response.json();

            if (data.success) {
                setWebsiteSource(data.source);
                setWebsitePages(data.pages || []);
                setWebsiteUsage(data.usage);

                if (data.source?.crawl_status === 'crawling') {
                    setTimeout(poll, 3000);
                }
            }
        };
        poll();
    };

    // Refresh website
    const refreshWebsite = async () => {
        if (!websiteSource) return;

        setRefreshing(true);
        try {
            const response = await fetch('/api/website/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ websiteSourceId: websiteSource.id })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh');
            }

            if (selectedBot) {
                pollWebsiteStatus(selectedBot.id);
            }
        } catch (error: any) {
            alert(error.message || 'Failed to refresh');
        } finally {
            setRefreshing(false);
        }
    };

    // Delete website source
    const deleteWebsiteSource = async () => {
        if (!selectedBot || !confirm('Remove all indexed pages from this website?')) return;

        try {
            const response = await fetch(`/api/website?chatbotId=${selectedBot.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete');
            }

            setWebsiteSource(null);
            setWebsitePages([]);
            setWebsiteUrl('');
        } catch (error: any) {
            alert(error.message || 'Failed to delete');
        }
    };

    const currentAnalytics = selectedBot ? analytics[selectedBot.id] : null;

    // Calculate peak hour - only if there's actual data
    const peakHour = (() => {
        if (!currentAnalytics?.hourlyData) return null;
        const hoursWithData = currentAnalytics.hourlyData.filter(h => h.count > 0);
        if (hoursWithData.length === 0) return null;
        return hoursWithData.reduce((max, curr) => curr.count > max.count ? curr : max);
    })();

    // Format hour with AM/PM and time of day description
    const formatPeakHour = (hour: number) => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const timeOfDay = hour >= 5 && hour < 12 ? 'Morning' :
            hour >= 12 && hour < 17 ? 'Afternoon' :
                hour >= 17 && hour < 21 ? 'Evening' : 'Night';
        return { time: `${hour12}:00 ${period}`, timeOfDay };
    };

    const peakHourFormatted = peakHour ? formatPeakHour(peakHour.hour) : null;
    const widgetOpens = currentAnalytics?.events.filter(e => e.event_type === 'widget_opened').length || 0;
    const widgetCloses = currentAnalytics?.events.filter(e => e.event_type === 'widget_closed').length || 0;

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#0A0A0A] flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-[#0A0A0A] text-gray-900 dark:text-white selection:bg-blue-500/30 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-96 border-r border-gray-200 dark:border-gray-200 dark:border-white/5 bg-white dark:bg-[#0A0A0A] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-gray-200 dark:border-white/5 flex items-center justify-between">
                    <Link href="/dashboard" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </div>
                        <span className="font-bold text-lg tracking-tight">MyWebChat</span>
                    </Link>
                </div>

                <div className="p-4 space-y-1 border-b border-gray-200 dark:border-gray-200 dark:border-white/5">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        Dashboard
                    </Link>
                    <Link href="/human-support" className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        Human Support
                    </Link>
                    <Link href="/gallery" className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Prompt Gallery
                    </Link>
                    <Link href="/pricing-plans" className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pricing Plans
                    </Link>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">Your Chatbots</div>

                    {chatbots.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No chatbots yet.
                        </div>
                    ) : (
                        chatbots.map(bot => (
                            <div
                                key={bot.id}
                                className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 group cursor-pointer ${selectedBot?.id === bot.id
                                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                                    : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent'
                                    }`}
                                onClick={() => setSelectedBot(bot)}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedBot?.id === bot.id ? 'bg-blue-500/20' : 'bg-gray-200 dark:bg-white/5'
                                    }`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{bot.name}</div>
                                    <div className="text-xs opacity-60 truncate">{bot.model_name}</div>
                                </div>
                                {/* Settings Gear Icon */}
                                <button
                                    onClick={(e) => openSettings(bot, e)}
                                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                                    title="Chatbot Settings"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-200 dark:border-white/5">
                    <Link
                        href="/create"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/20"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create New Chatbot
                    </Link>
                </div>
            </aside >

            {/* Main Content */}
            < main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0A0A0A]" >
                {!selectedBot ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="w-20 h-20 bg-gray-200 dark:bg-white/5 rounded-3xl flex items-center justify-center mb-6">
                            <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">MyWebChat Dashboard</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Select a chatbot from the sidebar to view its analytics and configuration.
                        </p>
                    </div>
                ) : loadingAnalytics ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto p-8">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{selectedBot.name}</h1>
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                    Active
                                    <span className="text-gray-600">•</span>
                                    <span className="capitalize">{selectedBot.llm_provider}</span>
                                    <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded text-xs text-gray-700 dark:text-gray-300">{selectedBot.model_name}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowKnowledgeBase(true)}
                                    className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 text-sm font-medium rounded-lg transition-colors border border-purple-500/20 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    Knowledge Base
                                    {documents.length > 0 && (
                                        <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                            {documents.length}
                                        </span>
                                    )}
                                </button>
                                <a
                                    href={`/test.html?chatbot=${selectedBot.embed_code}`}
                                    target="_blank"
                                    className="px-4 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors border border-gray-300 dark:border-white/10"
                                >
                                    Test Widget
                                </a>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                                    </svg>
                                    <span className="text-sm text-blue-400">Total Conversations</span>
                                </div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-white">{currentAnalytics?.total_conversations || 0}</div>
                            </div>
                            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                    </svg>
                                    <span className="text-sm text-green-400">Total Messages</span>
                                </div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{currentAnalytics?.total_messages || 0}</div>
                            </div>
                            <div className="p-6 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                    <span className="text-sm text-purple-400">Avg Messages/Conv</span>
                                </div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{currentAnalytics?.avg_messages || 0}</div>
                            </div>
                            <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm text-yellow-400">Peak Hour</span>
                                </div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {peakHourFormatted?.time || 'No data'}
                                </div>
                                {peakHourFormatted && peakHour && peakHour.count > 0 && (
                                    <div className="text-sm text-gray-500 mt-1">
                                        {peakHourFormatted.timeOfDay} • {peakHour.count} messages
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Session Status */}
                        <div className="grid md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    <span className="text-green-400 font-medium">Completed</span>
                                </div>
                                <div className="text-3xl font-bold text-gray-900 dark:text-white">{currentAnalytics?.completedConversations || 0}</div>
                                <div className="text-sm text-gray-500 mt-1">Conversations with 4+ messages</div>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                    <span className="text-yellow-400 font-medium">Open</span>
                                </div>
                                <div className="text-3xl font-bold text-gray-900 dark:text-white">{currentAnalytics?.openConversations || 0}</div>
                                <div className="text-sm text-gray-500 mt-1">Still active or not closed</div>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <span className="text-red-400 font-medium">Abandoned</span>
                                </div>
                                <div className="text-3xl font-bold text-gray-900 dark:text-white">{currentAnalytics?.abandonedConversations || 0}</div>
                                <div className="text-sm text-gray-500 mt-1">Closed before completion</div>
                            </div>
                        </div>

                        {/* Charts Row */}
                        <div className="grid lg:grid-cols-2 gap-6 mb-8">
                            {/* Peak Engagement Hours */}
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Peak Engagement Hours
                                </h3>
                                <div className="flex items-end gap-1 h-40">
                                    {currentAnalytics?.hourlyData.map((h, i) => {
                                        const maxCount = Math.max(...(currentAnalytics?.hourlyData.map(d => d.count) || [1]), 1);
                                        const height = (h.count / maxCount) * 100;
                                        const isPeak = h.hour === peakHour?.hour && h.count > 0;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center group relative">
                                                <div
                                                    className={`w-full rounded-t transition-all ${isPeak ? 'bg-blue-500' : 'bg-blue-500/30 group-hover:bg-blue-500/50'}`}
                                                    style={{ height: `${Math.max(height, 2)}%` }}
                                                ></div>
                                                {i % 4 === 0 && (
                                                    <span className="text-xs text-gray-500 mt-1">{h.hour}:00</span>
                                                )}
                                                <div className="absolute bottom-full mb-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                    {h.count} events at {h.hour}:00
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Word Cloud */}
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                    Most Used Words
                                </h3>
                                <div className="flex flex-wrap gap-2 min-h-[120px]">
                                    {currentAnalytics?.wordCloud && currentAnalytics.wordCloud.length > 0 ? currentAnalytics.wordCloud.map((w, i) => {
                                        const maxCount = currentAnalytics.wordCloud[0].count;
                                        const size = 0.7 + (w.count / maxCount) * 0.8;
                                        const colors = ['text-blue-400', 'text-purple-400', 'text-green-400', 'text-yellow-400', 'text-pink-400'];
                                        return (
                                            <span
                                                key={i}
                                                className={`${colors[i % colors.length]} transition-transform hover:scale-110 cursor-default`}
                                                style={{ fontSize: `${size}rem` }}
                                                title={`${w.count} occurrences`}
                                            >
                                                {w.word}
                                            </span>
                                        );
                                    }) : (
                                        <p className="text-gray-500 text-sm">No message data yet. Start chatting to see insights!</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Widget Activity */}
                        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 mb-8">
                            <h3 className="text-lg font-semibold text-white mb-4">Widget Activity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-400">{widgetOpens}</div>
                                    <div className="text-sm text-gray-500">Widget Opens</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-400">{widgetCloses}</div>
                                    <div className="text-sm text-gray-500">Widget Closes</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-400">
                                        {widgetOpens > 0 ? (((currentAnalytics?.total_conversations || 0) / widgetOpens) * 100).toFixed(0) : 0}%
                                    </div>
                                    <div className="text-sm text-gray-500">Engagement Rate</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-purple-400">
                                        {currentAnalytics?.events.filter(e => e.event_type === 'message_sent').length || 0}
                                    </div>
                                    <div className="text-sm text-gray-500">Messages Sent</div>
                                </div>
                            </div>
                        </div>

                        {/* Intent Analytics */}
                        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    User Intent Analytics
                                </h3>
                                <button
                                    onClick={async () => {
                                        if (!selectedBot) return;
                                        setDetectingIntents(true);
                                        try {
                                            // Use chatbot's configured API key (passed via chatbotId, decrypted server-side)
                                            const response = await fetch('/api/intents', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    chatbotId: selectedBot.id,
                                                    regenerate: true
                                                })
                                            });

                                            if (response.ok) {
                                                // Refresh analytics
                                                const analyticsRes = await fetch(`/api/intents?chatbotId=${selectedBot.id}&analytics=true`);
                                                const data = await analyticsRes.json();
                                                if (data.success) {
                                                    setIntentAnalyticsCache(prev => ({
                                                        ...prev,
                                                        [selectedBot.id]: data
                                                    }));
                                                }
                                            }
                                        } catch (error) {
                                            console.error('Failed to detect intents:', error);
                                        } finally {
                                            setDetectingIntents(false);
                                        }
                                    }}
                                    disabled={detectingIntents}
                                    className="text-xs px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 disabled:opacity-50 flex items-center gap-1"
                                >
                                    {detectingIntents ? (
                                        <>
                                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Detecting...
                                        </>
                                    ) : (
                                        <>Re-detect Intents</>
                                    )}
                                </button>
                            </div>

                            {intentAnalytics && intentAnalytics.intents.length > 0 ? (
                                <div className="space-y-6">
                                    {/* Full Width Intent Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-white/10">
                                                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-400">Intent</th>
                                                    <th className="text-right py-3 px-2 text-sm font-medium text-gray-400 w-24">Count</th>
                                                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-400 w-1/3">Distribution</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {intentAnalytics.intents.map((intent, i) => (
                                                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                        <td className="py-3 px-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: intent.color }} />
                                                                <span className="text-gray-200 text-sm">{intent.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2 text-right">
                                                            <span className="text-gray-400 text-sm">{intent.count}</span>
                                                            <span className="text-gray-600 text-xs ml-1">({intent.percentage}%)</span>
                                                        </td>
                                                        <td className="py-3 px-2">
                                                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full transition-all"
                                                                    style={{
                                                                        width: `${Math.max(intent.percentage, 2)}%`,
                                                                        backgroundColor: intent.color
                                                                    }}
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Summary Stats */}
                                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                                        <div className="text-sm text-gray-400">
                                            <span className="text-white font-semibold">{intentAnalytics.intents.length}</span> intents detected
                                        </div>
                                        <div className="text-sm text-gray-400">
                                            <span className="text-white font-semibold">{intentAnalytics.totalClassified}</span> messages classified
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <p className="text-gray-500 text-sm">No intent data yet</p>
                                    <p className="text-gray-600 text-xs mt-1">Upload content and click "Re-detect Intents" to get started</p>
                                </div>
                            )}
                        </div>

                        {/* Page Engagement */}
                        {currentAnalytics?.pageEngagement && currentAnalytics.pageEngagement.length > 0 && (
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 mb-8">
                                <h3 className="text-lg font-semibold text-white mb-4">Page Engagement</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4 text-sm font-medium text-gray-400 pb-2 border-b border-white/10">
                                        <div>Page URL</div>
                                        <div className="text-center">Widget Opens</div>
                                        <div className="text-center">Conversations</div>
                                    </div>
                                    {currentAnalytics.pageEngagement.map((page, i) => (
                                        <div key={i} className="grid grid-cols-3 gap-4 py-3 border-b border-gray-200 dark:border-white/5">
                                            <div className="text-white truncate" title={page.page_url}>
                                                {page.page_url}
                                            </div>
                                            <div className="text-center text-blue-400 font-semibold">{page.visits}</div>
                                            <div className="text-center text-green-400 font-semibold">{page.conversations}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Conversation History */}
                        <div className="grid lg:grid-cols-2 gap-6 mb-8">
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4">Chat History</h3>
                                {currentAnalytics?.conversations && currentAnalytics.conversations.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">No conversations yet.</p>
                                ) : (
                                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                                        {currentAnalytics?.conversations.map(conv => (
                                            <button
                                                key={conv.id}
                                                onClick={() => setSelectedConversation(conv)}
                                                className={`w-full text-left p-4 rounded-xl border transition-all ${selectedConversation?.id === conv.id
                                                    ? 'bg-blue-600/20 border-blue-500'
                                                    : 'bg-white/5 border-gray-200 dark:border-white/5 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm text-gray-400">
                                                        {new Date(conv.started_at).toLocaleDateString()} {new Date(conv.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${conv.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                                        conv.status === 'closed' || conv.status === 'abandoned' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-yellow-500/20 text-yellow-400'
                                                        }`}>
                                                        {conv.status || 'open'}
                                                    </span>
                                                </div>
                                                <div className="text-white font-medium truncate">
                                                    {conv.messages?.[0]?.content || 'No messages'}
                                                </div>
                                                <div className="text-sm text-gray-500 mt-1">
                                                    {conv.messages?.length || 0} messages
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4">Conversation Details</h3>
                                {selectedConversation ? (
                                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                                        {selectedConversation.messages?.map(msg => (
                                            <div
                                                key={msg.id}
                                                className={`p-3 rounded-xl ${msg.sender === 'user'
                                                    ? 'bg-blue-600/20 ml-8'
                                                    : 'bg-white/5 mr-8'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-xs font-medium ${msg.sender === 'user' ? 'text-blue-400' : 'text-gray-400'}`}>
                                                        {msg.sender === 'user' ? 'Visitor' : 'Bot'}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-white text-sm">{msg.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-8">Select a conversation to view details</p>
                                )}
                            </div>
                        </div>

                        {/* Embed Code */}
                        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8 mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Embed Code</h3>
                                <button
                                    onClick={copyToClipboard}
                                    className="text-sm px-3 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors"
                                >
                                    {copied ? 'Copied!' : 'Copy Code'}
                                </button>
                            </div>
                            <div className="bg-gray-900 dark:bg-[#0A0A0A] p-4 rounded-xl border border-gray-200 dark:border-white/5 overflow-x-auto">
                                <code className="text-sm text-gray-100 whitespace-nowrap">
                                    {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-chatbot-id="${selectedBot.embed_code}" async></script>`}
                                </code>
                            </div>
                        </div>

                        {/* Configuration */}
                        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Configuration</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-2">System Prompt</label>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#0A0A0A] p-4 rounded-xl border border-gray-200 dark:border-white/5 leading-relaxed">
                                        {selectedBot.system_prompt}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-2">Welcome Message</label>
                                        <div className="text-sm text-gray-700 dark:text-gray-300">{selectedBot.welcome_message}</div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-2">Primary Color</label>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg border border-white/10" style={{ backgroundColor: selectedBot.primary_color }}></div>
                                            <span className="text-sm text-gray-400 font-mono">{selectedBot.primary_color}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
                }
            </main >

            {/* Settings Modal */}
            {showSettings && editingBot && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-[#111] rounded-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto border border-gray-200 dark:border-white/10">
                        <div className="p-6 border-b border-gray-200 dark:border-white/5 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Chatbot Settings</h2>
                            <button
                                onClick={() => { setShowSettings(false); setEditingBot(null); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Chatbot Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Welcome Message</label>
                                <input
                                    type="text"
                                    value={editForm.welcome_message}
                                    onChange={e => setEditForm({ ...editForm, welcome_message: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">System Prompt</label>
                                <textarea
                                    value={editForm.system_prompt}
                                    onChange={e => setEditForm({ ...editForm, system_prompt: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all resize-none font-mono text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Primary Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={editForm.primary_color}
                                            onChange={e => setEditForm({ ...editForm, primary_color: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-gray-300 dark:border-white/5 cursor-pointer"
                                        />
                                        <span className="text-sm font-mono text-gray-500">{editForm.primary_color}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Model</label>
                                    <div className="text-sm text-gray-500 bg-gray-50 dark:bg-[#0A0A0A] px-4 py-3 rounded-xl border border-gray-300 dark:border-white/5">
                                        {editForm.model_name}
                                    </div>
                                </div>
                            </div>

                            {/* Human Intervention Rules Section */}
                            <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Human Intervention Rules</label>
                                        <p className="text-xs text-gray-500 mt-1">Messages matching these rules will be escalated to human agents</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addEscalationRule}
                                        className="px-3 py-1.5 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Rule
                                    </button>
                                </div>

                                {editForm.escalation_rules.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                                        <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        <p className="text-sm text-gray-500">No escalation rules configured</p>
                                        <p className="text-xs text-gray-400">Add rules to automatically forward specific topics to human agents</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {editForm.escalation_rules.map((rule, index) => (
                                            <div key={index} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-orange-500">Rule {index + 1}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeEscalationRule(index)}
                                                        className="p-1 hover:bg-red-100 dark:hover:bg-red-500/20 rounded text-red-500 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Rule name (e.g., refund_inquiries)"
                                                    value={rule.name}
                                                    onChange={e => updateEscalationRule(index, 'name', e.target.value)}
                                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Description (e.g., Questions about refunds, cancellations, or billing)"
                                                    value={rule.description}
                                                    onChange={e => updateEscalationRule(index, 'description', e.target.value)}
                                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Brief response (optional, e.g., I understand you have a billing question.)"
                                                    value={rule.brief_response}
                                                    onChange={e => updateEscalationRule(index, 'brief_response', e.target.value)}
                                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-4 py-2.5 text-red-500 hover:bg-red-500/10 rounded-xl text-sm font-medium transition-all"
                            >
                                Delete Chatbot
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setShowSettings(false); setEditingBot(null); }}
                                    className="px-6 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveSettings}
                                    disabled={saving || !editForm.name}
                                    className="px-6 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Saving...
                                        </>
                                    ) : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-[#111] rounded-2xl w-full max-w-md border border-gray-200 dark:border-white/10">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">Delete Chatbot?</h3>
                            <p className="text-center text-gray-500 mb-6">
                                Are you sure you want to delete &quot;{editingBot?.name}&quot;? This will also delete all conversations, messages, and analytics. This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={deleteChatbot}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deleting ? (
                                        <>
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Deleting...
                                        </>
                                    ) : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Knowledge Base Modal */}
            {showKnowledgeBase && selectedBot && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowKnowledgeBase(false); }}>
                    <div className="bg-white dark:bg-[#111] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-gray-200 dark:border-white/10 flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-6 border-b border-gray-200 dark:border-white/5 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    Knowledge Base
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">Add knowledge from documents or your website</p>
                            </div>
                            <button
                                onClick={() => setShowKnowledgeBase(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Mode Selector Tabs */}
                        <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-white/5 shrink-0">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setKbMode('documents')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${kbMode === 'documents'
                                        ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Upload Documents
                                </button>
                                <button
                                    onClick={() => setKbMode('website')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${kbMode === 'website'
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                    </svg>
                                    Index Website
                                    {websiteSource && (
                                        <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                            {websiteSource.page_count}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Usage Stats - Documents Mode */}
                        {kbMode === 'documents' && documentUsage && (
                            <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5 shrink-0">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-gray-600 dark:text-gray-400">Documents</span>
                                            <span className="font-medium text-gray-900 dark:text-white">{documentUsage.documentCount} / {documentUsage.maxDocuments}</span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-purple-500 rounded-full transition-all"
                                                style={{ width: `${(documentUsage.documentCount / documentUsage.maxDocuments) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-gray-600 dark:text-gray-400">Storage</span>
                                            <span className="font-medium text-gray-900 dark:text-white">{formatFileSize(documentUsage.totalSize)} / {formatFileSize(documentUsage.maxTotalSize)}</span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all"
                                                style={{ width: `${(documentUsage.totalSize / documentUsage.maxTotalSize) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full font-medium capitalize">{documentUsage.plan}</span>
                                </div>
                            </div>
                        )}

                        {/* Documents Mode Content */}
                        {kbMode === 'documents' && (
                            <>
                                {/* Upload Area */}
                                <div className="p-6 border-b border-gray-200 dark:border-white/5 shrink-0">
                                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading ? 'border-purple-500 bg-purple-500/10' : 'border-gray-300 dark:border-white/10 hover:border-purple-500 hover:bg-purple-500/5'}`}>
                                        <div className="flex flex-col items-center justify-center">
                                            {uploading ? (
                                                <>
                                                    <svg className="w-8 h-8 text-purple-400 animate-spin mb-2" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                    <p className="text-sm text-purple-400">{uploadProgress}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <p className="text-sm text-gray-500">
                                                        <span className="font-medium text-purple-400">Click to upload</span> or drag and drop
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (Max {documentUsage ? formatFileSize(documentUsage.maxFileSize) : '2MB'})</p>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept=".pdf,.docx,.txt,.md"
                                            disabled={uploading}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    uploadDocument(file);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </label>
                                </div>

                                {/* Document List */}
                                <div className="flex-1 overflow-y-auto p-6">
                                    {documents.length === 0 ? (
                                        <div className="text-center py-12">
                                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No documents yet</h3>
                                            <p className="text-sm text-gray-500">Upload documents to give your chatbot knowledge</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {documents.map(doc => (
                                                <div key={doc.id} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${doc.file_type.includes('pdf') ? 'bg-red-500/20 text-red-400' :
                                                        doc.file_type.includes('word') ? 'bg-blue-500/20 text-blue-400' :
                                                            'bg-gray-500/20 text-gray-400'
                                                        }`}>
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-900 dark:text-white truncate">{doc.original_filename || doc.filename}</div>
                                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                                            <span>{formatFileSize(doc.file_size)}</span>
                                                            {doc.status === 'ready' && doc.chunk_count > 0 && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{doc.chunk_count} chunks</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {doc.status === 'processing' && (
                                                            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full">
                                                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                                Processing
                                                            </span>
                                                        )}
                                                        {doc.status === 'ready' && (
                                                            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">Ready</span>
                                                        )}
                                                        {doc.status === 'error' && (
                                                            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full" title={doc.error_message}>Error</span>
                                                        )}
                                                        <button
                                                            onClick={() => deleteDocument(doc.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                            title="Delete document"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Website Mode Content */}
                        {kbMode === 'website' && (
                            <>
                                {/* Website Usage Stats */}
                                {websiteUsage && (
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5 shrink-0">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                    <span className="text-gray-600 dark:text-gray-400">Indexed Pages</span>
                                                    <span className="font-medium text-gray-900 dark:text-white">{websiteUsage.pageCount} / {websiteUsage.maxPages}</span>
                                                </div>
                                                <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full transition-all"
                                                        style={{ width: `${(websiteUsage.pageCount / websiteUsage.maxPages) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Website Input Area */}
                                {!websiteSource && (
                                    <div className="p-6 border-b border-gray-200 dark:border-white/5 shrink-0">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Website URL
                                                </label>
                                                <input
                                                    type="url"
                                                    value={websiteUrl}
                                                    onChange={(e) => setWebsiteUrl(e.target.value)}
                                                    placeholder="https://example.com"
                                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">We&apos;ll automatically discover pages using sitemap or crawling</p>
                                            </div>

                                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10"></span>
                                                <span>OR</span>
                                                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10"></span>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Upload Sitemap (XML)
                                                </label>
                                                <label className={`flex items-center justify-center w-full h-20 border-2 border-dashed rounded-xl cursor-pointer transition-all ${sitemapFile ? 'border-blue-500 bg-blue-500/10' : 'border-gray-300 dark:border-white/10 hover:border-blue-500 hover:bg-blue-500/5'
                                                    }`}>
                                                    {sitemapFile ? (
                                                        <div className="flex items-center gap-2 text-blue-400">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span>{sitemapFile.name}</span>
                                                            <button
                                                                onClick={(e) => { e.preventDefault(); setSitemapFile(null); }}
                                                                className="text-gray-400 hover:text-red-400"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-500">Click to upload sitemap.xml</span>
                                                    )}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept=".xml"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) setSitemapFile(file);
                                                        }}
                                                    />
                                                </label>
                                            </div>

                                            <button
                                                onClick={startWebsiteIndexing}
                                                disabled={indexing || (!websiteUrl && !sitemapFile)}
                                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                {indexing ? (
                                                    <>
                                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Starting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                        Start Indexing
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Website Source Info & Pages */}
                                {websiteSource && (
                                    <>
                                        <div className="p-6 border-b border-gray-200 dark:border-white/5 shrink-0">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                        </svg>
                                                        {websiteSource.url}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {websiteSource.crawl_status === 'crawling' ? (
                                                            <span className="text-yellow-400">Crawling in progress...</span>
                                                        ) : websiteSource.crawl_status === 'completed' ? (
                                                            <span className="text-green-400">{websiteSource.page_count} pages indexed</span>
                                                        ) : websiteSource.crawl_status === 'error' ? (
                                                            <span className="text-red-400">Error: {websiteSource.error_message}</span>
                                                        ) : (
                                                            <span>Pending</span>
                                                        )}
                                                        {websiteSource.last_crawl_at && (
                                                            <span className="ml-2">• Last updated {new Date(websiteSource.last_crawl_at).toLocaleDateString()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={refreshWebsite}
                                                        disabled={refreshing || websiteSource.crawl_status === 'crawling'}
                                                        className="px-3 py-1.5 text-sm bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 disabled:opacity-50 flex items-center gap-1"
                                                    >
                                                        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                        Refresh
                                                    </button>
                                                    <button
                                                        onClick={deleteWebsiteSource}
                                                        className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pages List */}
                                        <div className="flex-1 overflow-y-auto p-6">
                                            {websitePages.length === 0 ? (
                                                <div className="text-center py-12">
                                                    {websiteSource.crawl_status === 'crawling' ? (
                                                        <>
                                                            <svg className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                            </svg>
                                                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Crawling website...</h3>
                                                            <p className="text-sm text-gray-500">This may take a few minutes</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                            </svg>
                                                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No pages found</h3>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {websitePages.map(page => (
                                                        <div key={page.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/5">
                                                            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                                                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-gray-900 dark:text-white text-sm truncate">{page.title || page.url}</div>
                                                                <div className="text-xs text-gray-500 truncate">{page.url}</div>
                                                            </div>
                                                            {page.status === 'crawled' && (
                                                                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded shrink-0">✓</span>
                                                            )}
                                                            {page.status === 'error' && (
                                                                <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded shrink-0" title={page.error_message}>!</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
