/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic, 
  Square, 
  Upload, 
  FileAudio, 
  Loader2, 
  MessageSquare, 
  Languages, 
  FileText, 
  Volume2,
  Trash2,
  Play,
  Pause
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  audioUrl?: string;
  timestamp: Date;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [translation, setTranslation] = useState<string>('');
  const [targetLang, setTargetLang] = useState('Spanish');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Cleanup URLs
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Please allow microphone access to record voice messages.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setAudioBlob(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': []
    },
    multiple: false
  } as any);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async (task: 'transcribe' | 'summarize' | 'translate') => {
    if (!audioBlob) return;

    setIsProcessing(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      
      let prompt = "";
      if (task === 'transcribe') prompt = "Transcribe this audio accurately. Only return the transcript.";
      if (task === 'summarize') prompt = "Transcribe and then summarize this audio message in a few bullet points.";
      if (task === 'translate') prompt = `Transcribe and then translate this audio message into ${targetLang}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Audio, mimeType: audioBlob.type || "audio/webm" } }
            ]
          }
        ]
      });

      const result = response.text || "Could not process audio.";
      
      if (task === 'transcribe') setTranscript(result);
      if (task === 'summarize') setSummary(result);
      if (task === 'translate') setTranslation(result);
    } catch (error) {
      console.error("AI Error:", error);
      alert("Error processing audio with AI. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const speakText = async (text: string) => {
    if (!text) return;
    setIsProcessing(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioSrc = `data:audio/wav;base64,${base64Audio}`;
        const audio = new Audio(audioSrc);
        audio.play();
      }
    } catch (error) {
      console.error("TTS Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setSummary('');
    setTranslation('');
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Header */}
      <header className="border-b border-black/5 px-6 py-8 flex justify-between items-end max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-5xl font-serif italic tracking-tight leading-none">Vocalize AI</h1>
          <p className="text-xs uppercase tracking-widest mt-2 opacity-50 font-mono">Audio Intelligence Interface</p>
        </div>
        <div className="text-right font-mono text-[10px] opacity-40 uppercase tracking-tighter">
          System Status: Operational<br />
          Gemini 3.0 Engine
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-12 mt-8">
        
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase font-bold tracking-widest opacity-70">Capture Input</h2>
              {audioBlob && (
                <button 
                  onClick={reset}
                  className="text-[10px] uppercase font-bold text-red-500 hover:underline flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>

            {!audioBlob ? (
              <div className="space-y-6">
                {/* Recorder */}
                <div 
                  className={`relative h-64 border border-black/10 rounded-3xl flex flex-col items-center justify-center transition-all duration-500 ${isRecording ? 'bg-black text-white border-black scale-[1.02]' : 'bg-white hover:border-black/30'}`}
                >
                  <AnimatePresence mode="wait">
                    {isRecording ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center space-y-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                          <span className="font-mono text-2xl tracking-tighter">{formatTime(recordingTime)}</span>
                        </div>
                        <button 
                          onClick={stopRecording}
                          className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <Square fill="currentColor" size={24} />
                        </button>
                        <p className="text-[10px] uppercase tracking-widest opacity-50">Recording in progress...</p>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center space-y-6"
                      >
                        <button 
                          onClick={startRecording}
                          className="w-24 h-24 rounded-full border border-black/10 flex items-center justify-center hover:bg-black hover:text-white hover:border-black transition-all group"
                        >
                          <Mic size={32} className="group-hover:scale-110 transition-transform" />
                        </button>
                        <p className="text-[10px] uppercase tracking-widest opacity-50">Tap to record message</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-black/5"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest bg-[#FDFCFB] px-4 opacity-30">or</div>
                </div>

                {/* Dropzone */}
                <div 
                  {...getRootProps()} 
                  className={`h-40 border border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all hover:border-black/30 ${isDragActive ? 'bg-black/5 border-black' : ''}`}
                >
                  <input {...getInputProps()} />
                  <Upload size={24} className="opacity-30 mb-2" />
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Drop audio file here</p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-black/10 rounded-3xl p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                    <FileAudio size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Audio Message Ready</p>
                    <p className="text-[10px] opacity-50 uppercase tracking-widest">{(audioBlob.size / 1024 / 1024).toFixed(2)} MB • {audioBlob.type}</p>
                  </div>
                </div>
                
                <audio src={audioUrl!} controls className="w-full h-10" />

                <div className="grid grid-cols-1 gap-3 pt-4">
                  <button 
                    disabled={isProcessing}
                    onClick={() => processAudio('transcribe')}
                    className="w-full py-4 rounded-2xl border border-black text-[10px] uppercase font-bold tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                    Transcribe to Text
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => processAudio('summarize')}
                    className="w-full py-4 rounded-2xl border border-black text-[10px] uppercase font-bold tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <MessageSquare size={14} />}
                    Generate Summary
                  </button>
                  <div className="flex gap-2">
                    <select 
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="px-4 rounded-2xl border border-black/10 text-[10px] uppercase font-bold tracking-widest bg-white"
                    >
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Japanese</option>
                      <option>Chinese</option>
                      <option>Arabic</option>
                    </select>
                    <button 
                      disabled={isProcessing}
                      onClick={() => processAudio('translate')}
                      className="flex-1 py-4 rounded-2xl border border-black text-[10px] uppercase font-bold tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <Languages size={14} />}
                      Translate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Output */}
        <div className="lg:col-span-7 space-y-12">
          <AnimatePresence>
            {(transcript || summary || translation) ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                {/* Transcript */}
                {transcript && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase font-bold tracking-widest opacity-40">Transcript</h3>
                      <button onClick={() => speakText(transcript)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
                      <p className="text-lg leading-relaxed font-serif">{transcript}</p>
                    </div>
                  </section>
                )}

                {/* Summary */}
                {summary && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase font-bold tracking-widest opacity-40">AI Summary</h3>
                      <button onClick={() => speakText(summary)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="bg-[#F27D26]/5 border border-[#F27D26]/10 rounded-3xl p-8">
                      <div className="prose prose-sm prose-orange">
                        {summary.split('\n').map((line, i) => (
                          <p key={i} className="text-sm leading-relaxed">{line}</p>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {/* Translation */}
                {translation && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase font-bold tracking-widest opacity-40">Translation ({targetLang})</h3>
                      <button onClick={() => speakText(translation)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="bg-black text-white rounded-3xl p-8">
                      <p className="text-xl leading-relaxed font-serif italic">{translation}</p>
                    </div>
                  </section>
                )}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4 py-20">
                <div className="w-16 h-16 border border-black rounded-full flex items-center justify-center">
                  <Loader2 size={32} className={isProcessing ? "animate-spin" : ""} />
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold">Waiting for input processing</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full p-6 mt-20 border-t border-black/5 flex justify-between items-center text-[10px] uppercase tracking-widest opacity-30 font-mono">
        <div>© 2026 Vocalize AI Labs</div>
        <div className="flex gap-6">
          <span>Privacy</span>
          <span>Terms</span>
          <span>API</span>
        </div>
      </footer>
    </div>
  );
}
