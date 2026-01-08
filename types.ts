export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  isThinking?: boolean;
  groundingUrls?: Array<{
    title: string;
    uri: string;
  }>;
}

export enum PodcastMode {
  TOPIC = 'TOPIC',
  TEXT = 'TEXT',
  FILE = 'FILE',
  URL = 'URL'
}

export interface AudioState {
  isRecording: boolean;
  isProcessing: boolean;
  isPlaying: boolean;
  audioUrl: string | null;
}

export interface LiveConnectionState {
  isConnected: boolean;
  isTalking: boolean;
  volume: number;
}

export interface PodcastConfig {
  hostVoice: string;
  guestVoice: string;
  musicVolume: number;
  speechVolume: number;
}

export const AVAILABLE_VOICES = [
  { id: 'Puck', name: 'Puck (Tenor)' },
  { id: 'Charon', name: 'Charon (Deep)' },
  { id: 'Kore', name: 'Kore (Balanced)' },
  { id: 'Fenrir', name: 'Fenrir (Deep)' },
  { id: 'Zephyr', name: 'Zephyr (Bright)' },
];