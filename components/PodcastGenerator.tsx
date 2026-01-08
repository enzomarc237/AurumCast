import React, { useState, useEffect } from 'react';
import { PodcastMode, AVAILABLE_VOICES, PodcastConfig } from '../types';
import { Button } from './ui/Button';
import { generatePodcastScript, generatePodcastAudio, fetchUrlContent, transcribeAudio, mixAudioTracks } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';
import { FileText, Globe, Mic, Type, Download, Play, Pause, Music, Settings, Edit, Check } from 'lucide-react';

interface PodcastGeneratorProps {
  user: User | null;
}

export const PodcastGenerator: React.FC<PodcastGeneratorProps> = ({ user }) => {
  const [mode, setMode] = useState<PodcastMode>(PodcastMode.TOPIC);
  const [input, setInput] = useState('');
  
  // Script State
  const [generatedScript, setGeneratedScript] = useState('');
  const [isEditingScript, setIsEditingScript] = useState(false);
  
  // Audio State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [useSearch, setUseSearch] = useState(false);

  // Config State
  const [config, setConfig] = useState<PodcastConfig>({
    hostVoice: 'Kore',
    guestVoice: 'Fenrir',
    musicVolume: 0.3,
    speechVolume: 1.0
  });

  // Persistence Logic
  useEffect(() => {
    // 1. Try to load from User Metadata first (Cloud Sync)
    if (user?.user_metadata?.podcast_config) {
      setConfig(user.user_metadata.podcast_config);
      console.log("Loaded config from User Profile");
    } 
    // 2. Fallback to LocalStorage
    else {
      const local = localStorage.getItem('aurum_podcast_config');
      if (local) {
        try {
          setConfig(JSON.parse(local));
          console.log("Loaded config from LocalStorage");
        } catch (e) {
          console.error("Failed to parse local config", e);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    // 1. Save to LocalStorage immediately
    localStorage.setItem('aurum_podcast_config', JSON.stringify(config));

    // 2. Sync to Supabase if logged in (Debounced)
    if (user) {
      const timer = setTimeout(() => {
        supabase.auth.updateUser({
          data: { podcast_config: config }
        }).catch(err => console.error("Failed to sync config", err));
      }, 1500); // 1.5s debounce to avoid flooding API on slider change
      return () => clearTimeout(timer);
    }
  }, [config, user]);


  // Music Files
  const [introFile, setIntroFile] = useState<ArrayBuffer | null>(null);
  const [outroFile, setOutroFile] = useState<ArrayBuffer | null>(null);

  // Audio Player
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setInput(ev.target?.result as string);
        setStatus('File loaded. Ready to generate.');
      };
      reader.readAsText(file);
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'intro' | 'outro') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result instanceof ArrayBuffer) {
          if (type === 'intro') setIntroFile(ev.target.result);
          else setOutroFile(ev.target.result);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleTranscribe = async () => {
      setStatus('Recording for 5 seconds...');
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          const chunks: BlobPart[] = [];
          
          mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
          mediaRecorder.onstop = async () => {
              const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = async () => {
                   const result = reader.result as string;
                   const base64 = result.split(',')[1];
                   setStatus('Transcribing...');
                   const text = await transcribeAudio(base64, blob.type);
                   setInput(text);
                   setStatus('Transcription complete.');
                   stream.getTracks().forEach(t => t.stop());
              }
          };
          mediaRecorder.start();
          setTimeout(() => mediaRecorder.stop(), 5000);
      } catch (e) {
          setStatus('Mic permission denied or error.');
      }
  };

  const generateScript = async () => {
    setLoading(true);
    setAudioUrl(null);
    setGeneratedScript('');
    
    try {
      let contextText = input;
      if (mode === PodcastMode.URL) {
        setStatus('Fetching URL content...');
        contextText = await fetchUrlContent(input);
      }

      setStatus('Dreaming up the script (Gemini Thinking)...');
      const script = await generatePodcastScript(
        mode === PodcastMode.TOPIC ? input : "Convert this content into a podcast script.",
        useSearch,
        mode !== PodcastMode.TOPIC ? contextText : undefined
      );
      setGeneratedScript(script);
      setStatus('Script generated. Review and edit below.');
    } catch (err) {
      console.error(err);
      setStatus('Error generating script.');
    } finally {
      setLoading(false);
    }
  };

  const generateAudio = async () => {
    if (!generatedScript) return;
    setLoading(true);
    setStatus('Recording voices (TTS)...');
    
    try {
      // 1. Generate Raw TTS
      const base64Pcm = await generatePodcastAudio(generatedScript, config.hostVoice, config.guestVoice);
      
      // 2. Mix with Music
      setStatus('Mixing audio tracks...');
      const mixedAudioUrl = await mixAudioTracks(
          base64Pcm, 
          introFile, 
          outroFile, 
          config.musicVolume, 
          config.speechVolume
      );
      
      setAudioUrl(mixedAudioUrl);
      setStatus('Podcast Ready.');
    } catch (err) {
      console.error(err);
      setStatus('Error generating audio.');
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
      if (audioRef.current) {
          if (isPlaying) audioRef.current.pause();
          else audioRef.current.play();
          setIsPlaying(!isPlaying);
      }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      
      {/* 1. Mode Selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { m: PodcastMode.TOPIC, icon: Type, label: 'Topic Prompt' },
            { m: PodcastMode.TEXT, icon: FileText, label: 'Paste Text' },
            { m: PodcastMode.FILE, icon: Download, label: 'Upload File' },
            { m: PodcastMode.URL, icon: Globe, label: 'From URL' },
        ].map(({ m, icon: Icon, label }) => (
            <button 
                key={m}
                onClick={() => setMode(m)}
                className={`flex flex-col items-center p-4 rounded-xl border transition-all duration-300 ${mode === m ? 'bg-gold-500 text-slate-900 border-gold-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-gold-500/50'}`}
            >
                <Icon className="w-6 h-6 mb-2" />
                <span className="text-sm font-semibold">{label}</span>
            </button>
        ))}
      </div>

      {/* 2. Source Input */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-serif text-gold-200 mb-4">Step 1: Source Material</h3>
          {mode === PodcastMode.FILE ? (
              <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-gold-500/50 transition-colors">
                  <input type="file" onChange={handleFileUpload} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <Download className="w-8 h-8 text-gold-500 mb-2" />
                      <span className="text-slate-300">Click to upload document</span>
                  </label>
                  {input && <p className="mt-2 text-green-400 text-sm">File loaded successfully.</p>}
              </div>
          ) : (
            <div className="relative">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={mode === PodcastMode.URL ? "https://..." : "Enter your topic or text here..."}
                    className="w-full h-32 bg-black/50 border border-slate-700 rounded-lg p-4 text-slate-200 focus:border-gold-500 outline-none resize-none font-sans"
                />
                {mode === PodcastMode.TOPIC && (
                   <button 
                    onClick={handleTranscribe} 
                    className="absolute bottom-4 right-4 text-slate-500 hover:text-gold-400 p-2" 
                    title="Speak Input"
                   >
                       <Mic className="w-5 h-5" />
                   </button>
                )}
            </div>
          )}
          {mode === PodcastMode.TOPIC && (
            <div className="mt-4 flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="search" 
                    checked={useSearch} 
                    onChange={e => setUseSearch(e.target.checked)}
                    className="w-4 h-4 accent-gold-500 bg-slate-800 border-slate-600 rounded"
                />
                <label htmlFor="search" className="text-slate-400 text-sm select-none">Enable Google Search Grounding for fresh info</label>
            </div>
          )}
          
          <div className="mt-6">
             <Button onClick={generateScript} isLoading={loading && !generatedScript} disabled={!input || loading} className="w-full h-10">
                 {generatedScript ? 'Regenerate Script' : 'Generate Script'}
             </Button>
          </div>
      </div>

      {/* 3. Script Editor & Audio Config (Only visible after script is generated) */}
      {generatedScript && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 animate-fade-in-up">
              <div className="grid md:grid-cols-3 gap-8">
                  {/* Left: Script Editor */}
                  <div className="md:col-span-2 space-y-4">
                      <div className="flex justify-between items-center">
                          <h3 className="text-xl font-serif text-gold-200">Step 2: Review Script</h3>
                          <button 
                              onClick={() => setIsEditingScript(!isEditingScript)}
                              className="flex items-center gap-2 text-sm text-gold-400 hover:text-gold-300"
                          >
                              {isEditingScript ? <><Check className="w-4 h-4" /> Save</> : <><Edit className="w-4 h-4" /> Edit</>}
                          </button>
                      </div>
                      <div className={`rounded-xl p-4 bg-slate-950 border ${isEditingScript ? 'border-gold-500' : 'border-slate-800'} h-[400px] overflow-hidden`}>
                          {isEditingScript ? (
                              <textarea 
                                  value={generatedScript}
                                  onChange={(e) => setGeneratedScript(e.target.value)}
                                  className="w-full h-full bg-transparent border-none outline-none text-slate-300 font-mono text-sm resize-none"
                              />
                          ) : (
                              <pre className="w-full h-full overflow-y-auto whitespace-pre-wrap font-mono text-sm text-slate-400 leading-relaxed">
                                  {generatedScript}
                              </pre>
                          )}
                      </div>
                  </div>

                  {/* Right: Audio Configuration */}
                  <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h3 className="text-xl font-serif text-gold-200">Step 3: Configuration</h3>
                         {user && <span className="text-xs text-green-500 border border-green-900 bg-green-900/20 px-2 py-1 rounded">Cloud Sync Active</span>}
                      </div>
                      
                      {/* Voices */}
                      <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-2 text-gold-400 mb-2">
                              <Settings className="w-4 h-4" /> <span className="font-semibold text-sm">Cast Selection</span>
                          </div>
                          <div>
                              <label className="block text-xs text-slate-500 mb-1">Host (Alex)</label>
                              <select 
                                value={config.hostVoice}
                                onChange={(e) => setConfig({...config, hostVoice: e.target.value})}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-2 text-sm focus:border-gold-500 outline-none"
                              >
                                  {AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs text-slate-500 mb-1">Guest (Sam)</label>
                              <select 
                                value={config.guestVoice}
                                onChange={(e) => setConfig({...config, guestVoice: e.target.value})}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-2 text-sm focus:border-gold-500 outline-none"
                              >
                                  {AVAILABLE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                          </div>
                      </div>

                      {/* Music Mixing */}
                      <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-slate-800">
                           <div className="flex items-center gap-2 text-gold-400 mb-2">
                              <Music className="w-4 h-4" /> <span className="font-semibold text-sm">Sound Design</span>
                          </div>
                          
                          <div>
                              <label className="block text-xs text-slate-500 mb-1">Intro Music</label>
                              <input type="file" accept="audio/*" onChange={(e) => handleMusicUpload(e, 'intro')} className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:bg-slate-700 file:text-gold-400 hover:file:bg-slate-600" />
                          </div>
                          
                          <div>
                              <label className="block text-xs text-slate-500 mb-1">Outro Music</label>
                              <input type="file" accept="audio/*" onChange={(e) => handleMusicUpload(e, 'outro')} className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:bg-slate-700 file:text-gold-400 hover:file:bg-slate-600" />
                          </div>

                          <div className="pt-2">
                               <div className="flex justify-between text-xs text-slate-500 mb-1">
                                   <span>Music Vol</span>
                                   <span>Speech Vol</span>
                               </div>
                               <input 
                                  type="range" min="0" max="1" step="0.1" 
                                  value={config.musicVolume}
                                  onChange={(e) => setConfig({...config, musicVolume: parseFloat(e.target.value)})}
                                  className="w-full accent-gold-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer mb-2"
                                  title={`Music Volume: ${config.musicVolume}`}
                               />
                               <input 
                                  type="range" min="0.5" max="2" step="0.1" 
                                  value={config.speechVolume}
                                  onChange={(e) => setConfig({...config, speechVolume: parseFloat(e.target.value)})}
                                  className="w-full accent-gold-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                  title={`Speech Volume: ${config.speechVolume}`}
                               />
                          </div>
                      </div>

                      <Button onClick={generateAudio} isLoading={loading} className="w-full h-12">
                          Generate Final Audio
                      </Button>
                      
                      {status && <p className="text-center text-xs text-gold-400 animate-pulse">{status}</p>}
                  </div>
              </div>
          </div>
      )}

      {/* 4. Audio Result */}
      {audioUrl && (
          <div className="bg-slate-900 border border-gold-500/30 rounded-xl p-8 flex flex-col items-center justify-center space-y-6 relative overflow-hidden animate-fade-in-up shadow-[0_0_50px_rgba(0,0,0,0.5)]">
               <div className="absolute inset-0 bg-gradient-to-t from-gold-900/20 to-transparent pointer-events-none"></div>

               <h3 className="text-2xl font-serif text-white z-10">Now Playing</h3>
               
               <div className="w-32 h-32 rounded-full bg-slate-950 border-4 border-gold-500 flex items-center justify-center shadow-[0_0_30px_rgba(212,165,35,0.3)] z-10">
                   <button onClick={togglePlay} className="text-gold-100 hover:text-white transition-colors">
                       {isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current ml-2" />}
                   </button>
               </div>
               
               <audio 
                   ref={audioRef} 
                   src={audioUrl} 
                   onEnded={() => setIsPlaying(false)} 
                   onPlay={() => setIsPlaying(true)}
                   onPause={() => setIsPlaying(false)}
               />
               
               <div className="flex gap-4 z-10">
                   <a 
                       href={audioUrl} 
                       download="aurumcast_episode.wav"
                       className="flex items-center gap-2 px-6 py-3 rounded-full bg-gold-600 text-slate-900 font-bold hover:bg-gold-500 transition-all text-sm"
                   >
                       <Download className="w-4 h-4" /> Download Episode
                   </a>
               </div>
          </div>
      )}
    </div>
  );
};