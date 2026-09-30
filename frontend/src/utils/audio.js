// Record from mic, return 16 kHz mono PCM WAV (what the ASR models expect).
export async function recordWav() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream), chunks = []
  rec.ondataavailable = e => chunks.push(e.data)
  const done = new Promise(res => (rec.onstop = res))
  rec.start()
  return { stop: async () => {
    rec.stop(); await done; stream.getTracks().forEach(t => t.stop())
    return toWav16k(await new Blob(chunks).arrayBuffer())
  } }
}
async function toWav16k(buf) {
  const decoded = await new AudioContext().decodeAudioData(buf)
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start()
  const pcm = (await off.startRendering()).getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt ')
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true)
  out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true)
  pcm.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([out], { type: 'audio/wav' })
}
export const blobToB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(b) })
