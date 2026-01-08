import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { sendChatMessage } from '../services/geminiService';
import { Message } from '../types';
import { Send, Sparkles, Brain, Search, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export const ChatAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', content: "Greetings. I am Aurum, your podcast production assistant. How can I help you research or refine your content today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
        // Convert internal history to Gemini format
        const history = messages.map(m => ({ role: m.role, parts: [{ text: m.content }] }));
        
        const response = await sendChatMessage(userMsg.content, history, useSearch, useThinking);
        
        const botMsg: Message = { 
            id: (Date.now() + 1).toString(), 
            role: 'model', 
            content: response.text || "I'm sorry, I couldn't generate a response.",
            groundingUrls: response.grounding?.map((c: any) => c.web).filter(Boolean)
        };
        setMessages(prev => [...prev, botMsg]);
    } catch (error) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "An error occurred while communicating with the AI." }]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Header / Config */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <h3 className="text-gold-400 font-serif flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Aurum Assistant
            </h3>
            <div className="flex gap-2">
                <button 
                    onClick={() => { setUseSearch(!useSearch); setUseThinking(false); }}
                    className={`p-2 rounded-lg border transition-all ${useSearch ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'border-slate-700 text-slate-500'}`}
                    title="Google Search Grounding"
                >
                    <Search className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => { setUseThinking(!useThinking); setUseSearch(false); }}
                    className={`p-2 rounded-lg border transition-all ${useThinking ? 'bg-purple-900/30 border-purple-500 text-purple-400' : 'border-slate-700 text-slate-500'}`}
                    title="Deep Thinking Mode"
                >
                    <Brain className="w-4 h-4" />
                </button>
            </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-700' : 'bg-gold-600'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-slate-900" />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-slate-800 text-slate-200' : 'bg-slate-950 border border-gold-500/20 text-slate-300'}`}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                                <p className="text-xs text-slate-500 mb-1">Sources:</p>
                                <ul className="space-y-1">
                                    {msg.groundingUrls.map((url, idx) => (
                                        <li key={idx}>
                                            <a href={url.uri} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline truncate block max-w-xs">{url.title}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            ))}
            {isLoading && (
                 <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-gold-600 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-slate-900" />
                    </div>
                    <div className="bg-slate-950 border border-gold-500/20 rounded-2xl p-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-gold-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gold-500 rounded-full animate-bounce delay-100"></span>
                        <span className="w-2 h-2 bg-gold-500 rounded-full animate-bounce delay-200"></span>
                    </div>
                </div>
            )}
            <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
            <div className="flex gap-2">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={useThinking ? "Ask a complex question..." : "Type your message..."}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:border-gold-500 focus:outline-none placeholder-slate-600"
                />
                <Button onClick={handleSend} disabled={!input || isLoading} className="rounded-xl px-6">
                    <Send className="w-5 h-5" />
                </Button>
            </div>
        </div>
    </div>
  );
};