import React, { useState, useEffect } from 'react';
import { PodcastGenerator } from './components/PodcastGenerator';
import { LiveConversation } from './components/LiveConversation';
import { ChatAssistant } from './components/ChatAssistant';
import { AuthModal } from './components/AuthModal';
import { supabase } from './services/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { Mic2, Layers, MessageSquare, User as UserIcon, LogOut } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'podcast' | 'live' | 'chat'>('podcast');
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-gold-500/30 selection:text-gold-200">
      
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />

      {/* Cinematic Header */}
      <header className="relative w-full py-8 border-b border-gold-900/30 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold-900/10 via-slate-950 to-slate-950"></div>
        <div className="container mx-auto px-6 relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-700 rounded-lg flex items-center justify-center shadow-lg shadow-gold-500/20">
                <Mic2 className="text-slate-950 w-6 h-6" />
             </div>
             <div>
                <h1 className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-gold-200 to-gold-500">
                  AurumCast
                </h1>
                <p className="text-xs text-gold-500/60 uppercase tracking-widest">AI Audio Suite</p>
             </div>
          </div>
          
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex gap-1">
              {[
                { id: 'podcast', label: 'Generator', icon: Layers },
                { id: 'live', label: 'Live Studio', icon: Mic2 },
                { id: 'chat', label: 'Assistant', icon: MessageSquare },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 ${activeTab === item.id ? 'bg-gold-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-gold-300 hover:bg-slate-900'}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="h-8 w-[1px] bg-slate-800 hidden md:block"></div>

            {session ? (
              <div className="flex items-center gap-4">
                 <div className="hidden md:block text-right">
                    <p className="text-xs text-gold-400 font-bold">{session.user.email?.split('@')[0]}</p>
                    <p className="text-[10px] text-slate-500">PRODUCER</p>
                 </div>
                 <button 
                  onClick={handleLogout}
                  className="p-2 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-900 transition-colors"
                  title="Sign Out"
                 >
                   <LogOut className="w-5 h-5" />
                 </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-2 text-sm text-gold-400 hover:text-gold-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gold-900/30 border border-gold-500/30 flex items-center justify-center">
                  <UserIcon className="w-4 h-4" />
                </div>
                <span className="hidden md:inline">Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      <div className="md:hidden flex justify-around p-4 bg-slate-950 border-b border-slate-800">
        {[
           { id: 'podcast', label: 'Gen', icon: Layers },
           { id: 'live', label: 'Live', icon: Mic2 },
           { id: 'chat', label: 'Chat', icon: MessageSquare },
         ].map(item => (
           <button
             key={item.id}
             onClick={() => setActiveTab(item.id as any)}
             className={`flex flex-col items-center gap-1 ${activeTab === item.id ? 'text-gold-500' : 'text-slate-500'}`}
           >
             <item.icon className="w-5 h-5" />
             <span className="text-xs">{item.label}</span>
           </button>
         ))}
      </div>

      <main className="container mx-auto px-4 py-8 relative">
        {/* Soft Spotlight Gradient Background */}
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gold-500/5 rounded-full blur-[100px] pointer-events-none animate-spotlight"></div>

        <div className="relative z-10 transition-all duration-500">
          {activeTab === 'podcast' && (
            <div className="animate-fade-in-up">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-serif text-slate-100 mb-2">Create Audio Masterpieces</h2>
                <p className="text-slate-400 max-w-xl mx-auto">Transform ideas, text, or articles into professional-grade podcasts with multi-speaker synthesis.</p>
              </div>
              <PodcastGenerator user={session?.user || null} />
            </div>
          )}

          {activeTab === 'live' && (
            <div className="h-[70vh] animate-fade-in-up">
              <LiveConversation />
            </div>
          )}

          {activeTab === 'chat' && (
             <div className="max-w-3xl mx-auto animate-fade-in-up">
                <div className="text-center mb-6">
                   <h2 className="text-2xl font-serif text-slate-200">Production Assistant</h2>
                   <p className="text-slate-500 text-sm">Powered by Gemini Pro Thinking & Google Search</p>
                </div>
                <ChatAssistant />
             </div>
          )}
        </div>
      </main>

      <footer className="text-center py-8 text-slate-600 text-sm border-t border-slate-900 mt-12">
        <p>&copy; {new Date().getFullYear()} AurumCast AI. Powered by Google Gemini.</p>
      </footer>
    </div>
  );
}

export default App;