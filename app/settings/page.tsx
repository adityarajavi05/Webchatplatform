'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '@/components/AuthProvider';

type Tab = 'profile' | 'appearance' | 'app';

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        company: '',
        avatar: ''
    });
    const [appSettings, setAppSettings] = useState({
        notifications: true,
        emailReports: false,
        dataRetention: '30d',
        autoArchive: true
    });
    const [apiKeys, setApiKeys] = useState({
        openai: ''
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [saved, setSaved] = useState(false);

    // Load settings when user is available
    useEffect(() => {
        if (!user) return;

        // Load profile from localStorage (user-specific)
        const savedProfile = localStorage.getItem(`userProfile_${user.id}`);
        if (savedProfile) {
            setProfile(JSON.parse(savedProfile));
        } else {
            // Pre-populate email from auth
            setProfile(prev => ({ ...prev, email: user.email || '' }));
        }

        // Load app settings from localStorage (user-specific)
        const savedAppSettings = localStorage.getItem(`appSettings_${user.id}`);
        if (savedAppSettings) {
            setAppSettings(JSON.parse(savedAppSettings));
        }

        // Load API keys from localStorage (user-specific)
        const savedApiKeys = localStorage.getItem(`apiKeys_${user.id}`);
        if (savedApiKeys) {
            setApiKeys(JSON.parse(savedApiKeys));
        }
    }, [user]);

    function handleThemeChange(newTheme: 'dark' | 'light') {
        setTheme(newTheme);
        showSavedMessage();
    }

    function saveProfile() {
        if (!user) return;
        localStorage.setItem(`userProfile_${user.id}`, JSON.stringify(profile));
        showSavedMessage();
    }

    function saveAppSettings() {
        if (!user) return;
        localStorage.setItem(`appSettings_${user.id}`, JSON.stringify(appSettings));
        showSavedMessage();
    }

    function saveApiKeys() {
        if (!user) return;
        localStorage.setItem(`apiKeys_${user.id}`, JSON.stringify(apiKeys));
        showSavedMessage();
    }

    function showSavedMessage() {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-[#0A0A0A] text-gray-900 dark:text-white selection:bg-blue-500/30 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-96 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#0A0A0A] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-white/5">
                    <Link href="/dashboard" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </div>
                        <span className="font-bold text-lg tracking-tight">MyWebChat</span>
                    </Link>
                </div>

                <div className="p-4 space-y-1 border-b border-gray-200 dark:border-white/5">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        Dashboard
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
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                    </Link>
                </div>

                <div className="flex-1 p-6">
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-white/5">
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
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0A0A0A]">
                <div className="max-w-5xl mx-auto p-8 lg:p-12">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                        <p className="text-gray-400">Manage your account and application preferences</p>
                    </div>

                    {/* Saved Message */}
                    {saved && (
                        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Settings saved successfully!
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl mb-8 w-fit">
                        {[
                            { id: 'profile' as Tab, label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                            { id: 'appearance' as Tab, label: 'Appearance', icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
                            { id: 'app' as Tab, label: 'App Settings', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                                </svg>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Profile Information</h2>

                                <div className="space-y-6">
                                    {/* Avatar */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Profile Picture</label>
                                        <div className="flex items-center gap-4">
                                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
                                                {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                            <button className="px-4 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors border border-gray-300 dark:border-white/10">
                                                Change Avatar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            value={profile.name}
                                            onChange={e => setProfile({ ...profile, name: e.target.value })}
                                            placeholder="John Doe"
                                            className="w-full px-4 py-3 bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
                                        <input
                                            type="email"
                                            value={profile.email}
                                            onChange={e => setProfile({ ...profile, email: e.target.value })}
                                            placeholder="john@example.com"
                                            className="w-full px-4 py-3 bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        />
                                    </div>

                                    {/* Company */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company Name</label>
                                        <input
                                            type="text"
                                            value={profile.company}
                                            onChange={e => setProfile({ ...profile, company: e.target.value })}
                                            placeholder="Acme Inc."
                                            className="w-full px-4 py-3 bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        />
                                    </div>

                                    <button
                                        onClick={saveProfile}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all"
                                    >
                                        Save Profile
                                    </button>
                                </div>
                            </div>

                            {/* Account Section */}
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Account</h2>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-white/5 rounded-xl">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">Email Address</div>
                                            <div className="text-sm text-gray-500">{user?.email || 'Not logged in'}</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={signOut}
                                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium rounded-xl transition-all border border-red-500/20"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Appearance Tab */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Theme Preferences</h2>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Color Theme</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => handleThemeChange('dark')}
                                                className={`p-6 rounded-xl border-2 transition-all ${theme === 'dark'
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-10 h-10 bg-gray-900 dark:bg-[#0A0A0A] rounded-lg border border-gray-300 dark:border-white/10 flex items-center justify-center">
                                                        <svg className="w-5 h-5 text-gray-100 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                                        </svg>
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-semibold text-gray-900 dark:text-white">Dark Mode</div>
                                                        <div className="text-xs text-gray-400">Easy on the eyes</div>
                                                    </div>
                                                </div>
                                                {theme === 'dark' && (
                                                    <div className="flex items-center gap-2 text-sm text-blue-400">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Active
                                                    </div>
                                                )}
                                            </button>

                                            <button
                                                onClick={() => handleThemeChange('light')}
                                                className={`p-6 rounded-xl border-2 transition-all ${theme === 'light'
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                                                        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-semibold text-gray-900 dark:text-white">Light Mode</div>
                                                        <div className="text-xs text-gray-400">Bright and clean</div>
                                                    </div>
                                                </div>
                                                {theme === 'light' && (
                                                    <div className="flex items-center gap-2 text-sm text-blue-400">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Active
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                        <div className="flex gap-3">
                                            <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <div className="text-sm text-blue-300">
                                                <strong>Note:</strong> Theme changes apply immediately and are saved automatically. Your preference will be remembered across sessions.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* App Settings Tab */}
                    {activeTab === 'app' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Application Settings</h2>

                                <div className="space-y-6">
                                    {/* Notifications */}
                                    <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-white/5 rounded-xl">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">Push Notifications</div>
                                            <div className="text-sm text-gray-400">Receive notifications for new conversations</div>
                                        </div>
                                        <button
                                            onClick={() => setAppSettings({ ...appSettings, notifications: !appSettings.notifications })}
                                            className={`relative w-14 h-7 rounded-full transition-colors ${appSettings.notifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                                                }`}
                                        >
                                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${appSettings.notifications ? 'translate-x-7' : ''
                                                }`}></div>
                                        </button>
                                    </div>

                                    {/* Email Reports */}
                                    <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-white/5 rounded-xl">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">Email Reports</div>
                                            <div className="text-sm text-gray-400">Receive weekly analytics reports via email</div>
                                        </div>
                                        <button
                                            onClick={() => setAppSettings({ ...appSettings, emailReports: !appSettings.emailReports })}
                                            className={`relative w-14 h-7 rounded-full transition-colors ${appSettings.emailReports ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                                                }`}
                                        >
                                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${appSettings.emailReports ? 'translate-x-7' : ''
                                                }`}></div>
                                        </button>
                                    </div>

                                    {/* Auto Archive */}
                                    <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-white/5 rounded-xl">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">Auto Archive</div>
                                            <div className="text-sm text-gray-400">Automatically archive old conversations</div>
                                        </div>
                                        <button
                                            onClick={() => setAppSettings({ ...appSettings, autoArchive: !appSettings.autoArchive })}
                                            className={`relative w-14 h-7 rounded-full transition-colors ${appSettings.autoArchive ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                                                }`}
                                        >
                                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${appSettings.autoArchive ? 'translate-x-7' : ''
                                                }`}></div>
                                        </button>
                                    </div>

                                    {/* Data Retention */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Retention Period</label>
                                        <select
                                            value={appSettings.dataRetention}
                                            onChange={e => setAppSettings({ ...appSettings, dataRetention: e.target.value })}
                                            className="w-full px-4 py-3 bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        >
                                            <option value="7d">7 Days</option>
                                            <option value="30d">30 Days</option>
                                            <option value="90d">90 Days</option>
                                            <option value="1y">1 Year</option>
                                            <option value="forever">Forever</option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-2">
                                            How long to keep conversation data before automatic deletion
                                        </p>
                                    </div>

                                    <button
                                        onClick={saveAppSettings}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all"
                                    >
                                        Save Settings
                                    </button>
                                </div>
                            </div>

                            {/* API Keys */}
                            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">API Keys</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Configure API keys for AI features like prompt generation.</p>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            OpenAI API Key
                                        </label>
                                        <div className="flex gap-3">
                                            <div className="flex-1 relative">
                                                <input
                                                    type={showApiKey ? 'text' : 'password'}
                                                    value={apiKeys.openai}
                                                    onChange={e => setApiKeys({ ...apiKeys, openai: e.target.value })}
                                                    placeholder="sk-..."
                                                    className="w-full px-4 py-3 bg-white dark:bg-[#0A0A0A] border border-gray-300 dark:border-white/5 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                >
                                                    {showApiKey ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                            <button
                                                onClick={saveApiKeys}
                                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all"
                                            >
                                                Save Key
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            Used for AI prompt generation. Your key is stored locally and never sent to our servers.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
                                <h2 className="text-xl font-semibold text-red-400 mb-6">Danger Zone</h2>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">Export All Data</div>
                                            <div className="text-sm text-gray-400">Download all your chatbot data and conversations</div>
                                        </div>
                                        <button className="px-4 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors border border-gray-300 dark:border-white/10">
                                            Export
                                        </button>
                                    </div>

                                    <div className="border-t border-red-500/20 pt-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-red-400">Delete All Chatbots</div>
                                                <div className="text-sm text-gray-400">Permanently delete all chatbots and data</div>
                                            </div>
                                            <button className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-500/20">
                                                Delete All
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
