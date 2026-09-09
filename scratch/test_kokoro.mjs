import { KokoroTTS } from 'kokoro-js';
console.log('Loading Kokoro...');
const t0 = performance.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' });
console.log('Loaded in', (performance.now() - t0).toFixed(0), 'ms');
const t1 = performance.now();
const res = await tts.generate('Hello, testing Kokoro speech.', { voice: 'af_heart' });
console.log('Generated in', (performance.now() - t1).toFixed(0), 'ms');
console.log('Success! Audio size:', res.toWav().byteLength);
