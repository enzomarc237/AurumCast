import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Button } from './ui/Button';
import { Mic, MicOff, Radio } from 'lucide-react';
import { createPcmBlob, decodeAudioData } from '../services/geminiService';

const apiKey = process.env.API_KEY || '';

export const LiveConversation: React.FC = () => {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  
  // Refs for audio handling to avoid re-renders causing disconnects
  // We use a ref to hold the session promise or object to ensure we can close it
  const sessionRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stopConversation = () => {
    setStatus('Disconnecting...');
    
    // Stop Microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }

    // Stop Playback
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    nextStartTimeRef.current = 0;

    // Close Session
    if (sessionRef.current) {
        sessionRef.current.then(session => {
            try {
                session.close();
            } catch (e) {
                console.warn("Error closing session", e);
            }
        });
        sessionRef.current = null;
    }
    
    setActive(false);
    setStatus('Disconnected');
  };

  const startConversation = async () => {
    try {
      setStatus('Initializing Audio...');
      setActive(true);

      const ai = new GoogleGenAI({ apiKey });
      
      // Output Audio Context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = audioContextRef.current!.createGain();
      outputNode.connect(audioContextRef.current!.destination);
      nextStartTimeRef.current = audioContextRef.current!.currentTime; // Reset timing

      // Input Audio Context
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setStatus('Connecting to Gemini Live...');

      // Note: We assign the promise immediately so we can close it if the user cancels quickly
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('Connected - Listening');
            
            // Setup Mic Streaming
            if (!inputContextRef.current || !streamRef.current) return;
            
            const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              // Use the sessionPromise closure to send data
              sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              // Ensure we don't schedule in the past
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
              
              const audioBuffer = await decodeAudioData(base64Audio, audioContextRef.current, 24000);
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(s => s.stop());
               sourcesRef.current.clear();
               nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onclose: () => {
            setStatus('Session Closed');
            setActive(false);
          },
          onerror: (err) => {
            console.error(err);
            setStatus('Error occurred');
            setActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: "You are a charismatic podcast co-host named Zephyr. You are witty, intelligent, and have a great radio voice. Keep answers concise."
        }
      });
      
      sessionRef.current = sessionPromise;
      await sessionPromise; // Wait for connection

    } catch (error) {
      console.error("Live Error", error);
      setStatus('Failed to connect');
      setActive(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopConversation();
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-slate-950 to-black rounded-3xl border border-gold-500/20 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gold-500/20 rounded-full blur-[120px] transition-all duration-1000 ${active ? 'scale-110 opacity-60' : 'scale-90 opacity-20'}`}></div>

        <div className="z-10 text-center space-y-8">
            <h2 className="text-3xl font-serif text-gold-100">Live Studio</h2>
            
            <div className={`relative w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${active ? 'border-gold-500 shadow-[0_0_40px_rgba(212,165,35,0.4)]' : 'border-slate-700'}`}>
                <div className={`w-40 h-40 rounded-full bg-slate-900 flex items-center justify-center`}>
                     {active ? (
                         <div className="flex gap-1 h-12 items-center">
                             {[1,2,3,4,5].map(i => (
                                 <div key={i} className="w-2 bg-gold-500 animate-pulse-slow" style={{height: '40%', animationDelay: `${i * 0.1}s`}}></div>
                             ))}
                         </div>
                     ) : (
                         <Radio className="w-12 h-12 text-slate-600" />
                     )}
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-gold-300 font-medium tracking-wide uppercase text-sm">{status}</p>
                {active && <p className="text-slate-400 text-xs">Speak naturally to Zephyr</p>}
            </div>

            <div className="flex justify-center pt-4">
                {!active ? (
                    <Button onClick={startConversation} className="rounded-full h-16 w-16 !p-0 flex items-center justify-center bg-gold-600 hover:bg-gold-500">
                        <Mic className="w-6 h-6 text-slate-950" />
                    </Button>
                ) : (
                    <Button onClick={stopConversation} variant="danger" className="rounded-full h-16 w-16 !p-0 flex items-center justify-center">
                        <MicOff className="w-6 h-6" />
                    </Button>
                )}
            </div>
        </div>
    </div>
  );
};