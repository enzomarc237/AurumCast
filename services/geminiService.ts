import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";

const apiKey = process.env.API_KEY || '';

// --- 1. Script Generation (Thinking & Search) ---

export const generatePodcastScript = async (
  topic: string, 
  useSearch: boolean, 
  fullTextContext?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  let modelName = 'gemini-3-pro-preview';
  let tools: any[] = [];
  let thinkingConfig: any = { thinkingBudget: 1024 };

  if (useSearch) {
    modelName = 'gemini-3-flash-preview';
    tools = [{ googleSearch: {} }];
    thinkingConfig = undefined;
  } else {
    modelName = 'gemini-3-pro-preview';
    thinkingConfig = { thinkingBudget: 32768 };
  }

  let prompt = `You are an expert podcast producer. Write a compelling, engaging podcast script based on the following input. 
  The script should be a dialogue between a Host (Alex) and a Guest (Sam).
  Make it sound natural, with fillers like "hmm", "interesting", etc.
  
  Input Context: ${fullTextContext ? fullTextContext.substring(0, 20000) : topic}
  
  Format the output purely as the script text. Use "Alex:" and "Sam:" to denote speakers.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      tools: tools.length > 0 ? tools : undefined,
      thinkingConfig: thinkingConfig,
    }
  });

  return response.text || "Failed to generate script.";
};

// --- 2. Text to Speech (TTS) ---

export const generatePodcastAudio = async (
  script: string,
  hostVoice: string = 'Kore',
  guestVoice: string = 'Fenrir'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Alex',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: hostVoice } }
            },
            {
              speaker: 'Sam',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: guestVoice } }
            }
          ]
        }
      }
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");

  return base64Audio;
};

// --- Audio Mixing Service ---

export const mixAudioTracks = async (
  speechBase64: string,
  introBuffer: ArrayBuffer | null,
  outroBuffer: ArrayBuffer | null,
  musicVolume: number,
  speechVolume: number
): Promise<string> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Decode Speech
  const speechAudioBuffer = await decodeAudioData(speechBase64, ctx, 24000); // 24k is Gemini default
  
  // Decode Music
  const introAudioBuffer = introBuffer ? await ctx.decodeAudioData(introBuffer.slice(0)) : null;
  const outroAudioBuffer = outroBuffer ? await ctx.decodeAudioData(outroBuffer.slice(0)) : null;

  // Calculate total duration
  // Strategy: Intro -> (Fade overlap) -> Speech -> (Fade overlap) -> Outro
  const overlap = 2.0; // 2 seconds overlap/crossfade
  
  let totalDuration = speechAudioBuffer.duration;
  let speechStartTime = 0;
  let outroStartTime = totalDuration;

  if (introAudioBuffer) {
    speechStartTime = Math.max(0, introAudioBuffer.duration - overlap);
    totalDuration = speechStartTime + speechAudioBuffer.duration;
  }
  
  if (outroAudioBuffer) {
    outroStartTime = totalDuration - overlap; // Start outro before speech ends
    // But ensure we don't start outro before speech actually starts + minimal duration
    outroStartTime = Math.max(speechStartTime + 1, outroStartTime); 
    totalDuration = outroStartTime + outroAudioBuffer.duration;
  }

  // Create Offline Context
  // Note: OfflineAudioContext might need standard sample rate (44100 or 48000) for compatibility
  const renderRate = 44100;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(totalDuration * renderRate), renderRate);

  // Setup Sources
  
  // 1. Intro
  if (introAudioBuffer) {
    const introSource = offlineCtx.createBufferSource();
    introSource.buffer = introAudioBuffer;
    const introGain = offlineCtx.createGain();
    introGain.gain.value = musicVolume;
    introSource.connect(introGain);
    introGain.connect(offlineCtx.destination);
    introSource.start(0);
    // Fade out intro music under speech
    introGain.gain.setValueAtTime(musicVolume, speechStartTime);
    introGain.gain.linearRampToValueAtTime(0, speechStartTime + 2); 
  }

  // 2. Speech
  const speechSource = offlineCtx.createBufferSource();
  speechSource.buffer = speechAudioBuffer;
  const speechGain = offlineCtx.createGain();
  speechGain.gain.value = speechVolume;
  speechSource.connect(speechGain);
  speechGain.connect(offlineCtx.destination);
  speechSource.start(speechStartTime);

  // 3. Outro
  if (outroAudioBuffer) {
    const outroSource = offlineCtx.createBufferSource();
    outroSource.buffer = outroAudioBuffer;
    const outroGain = offlineCtx.createGain();
    outroGain.gain.value = 0;
    outroSource.connect(outroGain);
    outroGain.connect(offlineCtx.destination);
    outroSource.start(outroStartTime);
    // Fade in outro
    outroGain.gain.setValueAtTime(0, outroStartTime);
    outroGain.gain.linearRampToValueAtTime(musicVolume, outroStartTime + 2);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWavUrl(renderedBuffer);
};

// Helper: Convert AudioBuffer to WAV URL
function audioBufferToWavUrl(buffer: AudioBuffer): string {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for(let i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  let p = 44;
  while(p < length){
    for(let i = 0; i < numOfChan; i++){
      let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit
      view.setInt16(p, sample, true);
      p += 2;
    }
    offset++;
  }

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  const blob = new Blob([bufferArr], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// Helper to convert PCM Base64 to WAV Blob URL (Legacy/Simple use)
export const pcmToWav = (base64Pcm: string, sampleRate: number = 24000): string => {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const channels = 1; 
  const format = 1; // PCM
  const bitDepth = 16;
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bytes.length, true);

  const blob = new Blob([view, bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// --- 3. Chatbot (Conversational & Search) ---

export const sendChatMessage = async (
  message: string, 
  history: any[], 
  useSearch: boolean, 
  useThinking: boolean
) => {
  const ai = new GoogleGenAI({ apiKey });
  
  let model = 'gemini-3-flash-preview';
  let tools: any[] = [];
  let thinkingConfig: any = undefined;

  if (useThinking) {
    model = 'gemini-3-pro-preview';
    thinkingConfig = { thinkingBudget: 32768 };
  } else if (useSearch) {
    model = 'gemini-3-flash-preview';
    tools = [{ googleSearch: {} }];
  } else {
    model = 'gemini-2.5-flash-lite-latest';
  }

  const chat = ai.chats.create({
    model: model,
    config: {
      tools: tools.length > 0 ? tools : undefined,
      thinkingConfig: thinkingConfig,
    },
    history: history
  });

  const response = await chat.sendMessage({ message });
  return {
    text: response.text,
    grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks
  };
};

// --- 4. Transcription ---

export const transcribeAudio = async (base64Audio: string, mimeType: string = "audio/wav"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType, 
            data: base64Audio
          }
        },
        { text: "Transcribe this audio exactly." }
      ]
    }
  });

  return response.text || "";
};

// --- 5. Content Extraction (URL) ---
export const fetchUrlContent = async (url: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Retrieve and extract the main text content from this URL: ${url}. Return only the content text.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
  return response.text || "";
};

// --- 6. Live API Helper Functions ---

export const createPcmBlob = (data: Float32Array): { data: string, mimeType: string } => {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  };
};

export const decodeAudioData = async (
  base64: string,
  ctx: AudioContext | BaseAudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
};