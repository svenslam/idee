
export type NoteType = 'text' | 'voice' | 'idea';

export interface Note {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  createdAt: number;
  tags: string[];
}

export interface VoiceSessionState {
  isActive: boolean;
  transcription: string;
  response: string;
  isProcessing: boolean;
}
