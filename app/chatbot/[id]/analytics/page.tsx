'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

interface Chatbot {
    id: string;
    name: string;
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
    status: string;
    page_url?: string;
    total_messages: number;
    messages: Message[];
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

type DateRange = '7d' | '30d' | 'all';

export default function AnalyticsPage() {
    const params = useParams();
    const [chatbot, setChatbot] = useState<Chatbot | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [events, setEvents] = useState<WidgetEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange>('7d');
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'conversations' | 'pages'>('overview');

    // Derived analytics data
    const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
    const [wordCloud, setWordCloud] = useState<WordCount[]>([]);
    const [pageEngagement, setPageEngagement] = useState<PageEngagement[]>([]);

    useEffect(() => {
        fetchData();
    }, [params.id, dateRange]);

    async function fetchData() {
        setLoading(true);

        // Calculate date filter
        let dateFilter: string | null = null;
        if (dateRange === '7d') {
            dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateRange === '30d') {
            dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        // Fetch chatbot
        const { data: chatbotData } = await supabase
            .from('chatbots')
            .select('id, name')
            .eq('id', params.id)
            .single();

        setChatbot(chatbotData);

        // Fetch conversations with messages
        let convQuery = supabase
            .from('conversations')
            .select('*, messages(*)')
            .eq('chatbot_id', params.id)
            .order('started_at', { ascending: false });

        if (dateFilter) {
            convQuery = convQuery.gte('started_at', dateFilter);
        }

        const { data: convData } = await convQuery.limit(100);
        setConversations(convData || []);

        // Fetch widget events
        let eventsQuery = supabase
            .from('widget_events')
            .select('*')
            .eq('chatbot_id', params.id)
            .order('created_at', { ascending: false });

        if (dateFilter) {
            eventsQuery = eventsQuery.gte('created_at', dateFilter);
        }

        const { data: eventsData } = await eventsQuery.limit(500);
        setEvents(eventsData || []);

        // Process analytics data
        processAnalytics(convData || [], eventsData || []);
        setLoading(false);
    }

    function processAnalytics(convs: Conversation[], evts: WidgetEvent[]) {
        // Peak engagement hours
        const hourCounts: Record<number, number> = {};
        evts.forEach(e => {
            const hour = new Date(e.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const hourlyArr: HourlyData[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: hourCounts[i] || 0
        }));
        setHourlyData(hourlyArr);

        // Word cloud from messages
        const wordCounts: Record<string, number> = {};
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'okay', 'ok']);

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

        const wordCloudArr: WordCount[] = Object.entries(wordCounts)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);
        setWordCloud(wordCloudArr);

        // Page engagement
        const pageStats: Record<string, { visits: number; conversations: number }> = {};
        evts.forEach(e => {
            if (e.page_url) {
                const url = new URL(e.page_url).pathname;
                if (!pageStats[url]) {
                    pageStats[url] = { visits: 0, conversations: 0 };
                }
                if (e.event_type === 'widget_opened') {
                    pageStats[url].visits++;
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

        const pageArr: PageEngagement[] = Object.entries(pageStats)
            .map(([page_url, stats]) => ({ page_url, ...stats }))
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 10);
        setPageEngagement(pageArr);
    }

    // Computed stats
    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0);
    const avgMessagesPerConversation = totalConversations > 0
        ? (totalMessages / totalConversations).toFixed(1)
        : '0';

    const completedConversations = conversations.filter(c => c.status === 'completed' || (c.messages?.length || 0) >= 4).length;
    const abandonedConversations = conversations.filter(c => c.status === 'closed' || c.status === 'abandoned').length;
    const openConversations = conversations.filter(c => c.status === 'open' || !c.status).length;

    const widgetOpens = events.filter(e => e.event_type === 'widget_opened').length;
    const widgetCloses = events.filter(e => e.event_type === 'widget_closed').length;

    const peakHour = hourlyData.reduce((max, curr) => curr.count > max.count ? curr : max, { hour: 0, count: 0 });

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white py-8 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link
                            href={`/chatbot/${params.id}`}
                            className="inline-flex items-center text-gray-500 hover:text-white transition-colors text-sm mb-2"
                        >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to {chatbot?.name}
                        </Link>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Analytics Dashboard
                        </h1>
                    </div>

                    {/* Date Range Selector  */}
                    <div className="flex gap-2">
                        {(['7d', '30d', 'all'] as DateRange[]).map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === range
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All Time'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-8 w-fit">
                    {(['overview', 'conversations', 'pages'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all capitalize ${activeTab === tab
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === 'overview' && (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <StatCard
                                label="Total Conversations"
                                value={totalConversations}
                                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />}
                                color="blue"
                            />
                            <StatCard
                                label="Total Messages"
                                value={totalMessages}
                                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />}
                                color="green"
                            />
                            <StatCard
                                label="Avg Messages/Conv"
                                value={avgMessagesPerConversation}
                                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
                                color="purple"
                            />
                            <StatCard
                                label="Peak Hour"
                                value={`${peakHour.hour}:00`}
                                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                                color="yellow"
                            />
                        </div>

                        {/* Session Status */}
                        <div className="grid md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    <span className="text-green-400 font-medium">Completed</span>
                                </div>
                                <div className="text-3xl font-bold text-white">{completedConversations}</div>
                                <div className="text-sm text-gray-500 mt-1">Conversations with 4+ messages</div>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                    <span className="text-yellow-400 font-medium">Open</span>
                                </div>
                                <div className="text-3xl font-bold text-white">{openConversations}</div>
                                <div className="text-sm text-gray-500 mt-1">Still active or not closed</div>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <span className="text-red-400 font-medium">Abandoned</span>
                                </div>
                                <div className="text-3xl font-bold text-white">{abandonedConversations}</div>
                                <div className="text-sm text-gray-500 mt-1">Closed before completion</div>
                            </div>
                        </div>

                        {/* Charts Row */}
                        <div className="grid lg:grid-cols-2 gap-6 mb-8">
                            {/* Peak Engagement Hours */}
                            <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Peak Engagement Hours
                                </h3>
                                <div className="flex items-end gap-1 h-40">
                                    {hourlyData.map((h, i) => {
                                        const maxCount = Math.max(...hourlyData.map(d => d.count), 1);
                                        const height = (h.count / maxCount) * 100;
                                        const isPeak = h.hour === peakHour.hour && h.count > 0;
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
                            <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                    Most Used Words
                                </h3>
                                <div className="flex flex-wrap gap-2 min-h-[120px]">
                                    {wordCloud.length > 0 ? wordCloud.map((w, i) => {
                                        const maxCount = wordCloud[0].count;
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
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6 mb-8">
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
                                        {widgetOpens > 0 ? ((totalConversations / widgetOpens) * 100).toFixed(0) : 0}%
                                    </div>
                                    <div className="text-sm text-gray-500">Engagement Rate</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-purple-400">
                                        {events.filter(e => e.event_type === 'message_sent').length}
                                    </div>
                                    <div className="text-sm text-gray-500">Messages Sent</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'conversations' && (
                    <div className="grid lg:grid-cols-2 gap-6">
                        {/* Conversation List */}
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Chat History</h3>
                            {conversations.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">No conversations yet.</p>
                            ) : (
                                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                                    {conversations.map(conv => (
                                        <button
                                            key={conv.id}
                                            onClick={() => setSelectedConversation(conv)}
                                            className={`w-full text-left p-4 rounded-xl border transition-all ${selectedConversation?.id === conv.id
                                                ? 'bg-blue-600/20 border-blue-500'
                                                : 'bg-white/5 border-white/5 hover:border-white/20'
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

                        {/* Selected Conversation */}
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
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
                )}

                {activeTab === 'pages' && (
                    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Page Engagement</h3>
                        {pageEngagement.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No page data yet. Embed the widget to track page engagement.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4 text-sm font-medium text-gray-400 pb-2 border-b border-white/10">
                                    <div>Page URL</div>
                                    <div className="text-center">Widget Opens</div>
                                    <div className="text-center">Conversations Started</div>
                                </div>
                                {pageEngagement.map((page, i) => (
                                    <div key={i} className="grid grid-cols-3 gap-4 py-3 border-b border-white/5">
                                        <div className="text-white truncate" title={page.page_url}>
                                            {page.page_url}
                                        </div>
                                        <div className="text-center text-blue-400 font-semibold">{page.visits}</div>
                                        <div className="text-center text-green-400 font-semibold">{page.conversations}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        green: 'bg-green-500/10 border-green-500/20 text-green-400',
        purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
        yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    };

    return (
        <div className={`${colorClasses[color]} border rounded-2xl p-5`}>
            <div className="flex items-center gap-3 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {icon}
                </svg>
                <span className="text-sm opacity-80">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
        </div>
    );
}
