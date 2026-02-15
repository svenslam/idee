
import { GoogleGenAI, Type } from "@google/genai";

export const getGeminiClient = () => {
  // Gebruik de API sleutel direct vanuit process.env
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Geen API_KEY gevonden in process.env");
  }
  return new GoogleGenAI({ apiKey: apiKey || "" });
};

export const summarizeNote = async (content: string): Promise<string> => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Vat de volgende notitie kort samen in maximaal 10 woorden: "${content}"`,
  });
  return response.text || "Nieuwe notitie";
};

export const categorizeNote = async (content: string): Promise<string[]> => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Geef maximaal 3 relevante tags voor deze notitie als een kommagescheiden lijst: "${content}"`,
  });
  return (response.text || "").split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
};

// Audio helpers for Live API
export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
