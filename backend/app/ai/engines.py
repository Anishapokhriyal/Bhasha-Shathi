"""Adapter engines. Each result reports the provider that ACTUALLY ran and its
mode ('online' = network API, 'offline' = local model). Nothing is labelled
offline unless it ran locally. Confidence is None unless a provider supplies one
(no calibrated score exists yet)."""
import base64, io, time
import httpx
from difflib import SequenceMatcher
from ..config import SARVAM_API_KEY

class Unavailable(Exception):
    pass

# language code maps: app code -> (Sarvam BCP-47, IndicTrans2 flores code)
LANGS = {"hi": ("hi-IN", "hin_Deva"), "sat": ("sat-IN", "sat_Olck"), "en": ("en-IN", "eng_Latn")}
SARVAM = "https://api.sarvam.ai"
_hdr = lambda: {"api-subscription-key": SARVAM_API_KEY}

# ---------------- ASR ----------------
class SarvamASR:
    name, mode = "sarvam-asr", "online"
    def available(self): return bool(SARVAM_API_KEY)
    def run(self, wav, lang):
        r = httpx.post(f"{SARVAM}/speech-to-text", headers=_hdr(), timeout=60,
                       files={"file": ("a.wav", wav, "audio/wav")},
                       data={"language_code": LANGS[lang][0]})
        r.raise_for_status()
        return r.json()["transcript"]

class IndicConformerASR:
    name, mode = "indicconformer", "offline"
    _m = None
    def available(self):
        try: import torch, torchaudio, transformers; return True
        except ImportError: return False
    def run(self, wav, lang):
        import torch, torchaudio
        if not self._m:
            from transformers import AutoModel
            IndicConformerASR._m = AutoModel.from_pretrained(
                "ai4bharat/indic-conformer-600m-multilingual", trust_remote_code=True)
        w, sr = torchaudio.load(io.BytesIO(wav))          # expects 16 kHz mono PCM WAV
        w = w.mean(0, keepdim=True)
        if sr != 16000: w = torchaudio.functional.resample(w, sr, 16000)
        return self._m(w, lang, "ctc")                     # verify language support for 'sat'

# ---------------- Translation ----------------
class SarvamMT:
    name, mode = "sarvam-translate", "online"
    def available(self): return bool(SARVAM_API_KEY)
    def run(self, text, src, tgt):
        r = httpx.post(f"{SARVAM}/translate", headers=_hdr(), timeout=30, json={
            "input": text, "source_language_code": LANGS[src][0],
            "target_language_code": LANGS[tgt][0]})   # verify sat-IN support in current docs
        r.raise_for_status()
        return r.json()["translated_text"]

class IndicTrans2MT:
    name, mode = "indictrans2", "offline"
    _tok = _model = _ip = None
    MODEL = "ai4bharat/indictrans2-indic-indic-dist-320M"
    def available(self):
        try: import torch, transformers, IndicTransToolkit; return True
        except ImportError: return False
    def run(self, text, src, tgt):
        import torch
        if not self._model:
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
            from IndicTransToolkit.processor import IndicProcessor
            c = IndicTrans2MT
            c._tok = AutoTokenizer.from_pretrained(self.MODEL, trust_remote_code=True)
            c._model = AutoModelForSeq2SeqLM.from_pretrained(self.MODEL, trust_remote_code=True).eval()
            c._ip = IndicProcessor(inference=True)
        s, t = LANGS[src][1], LANGS[tgt][1]
        batch = self._ip.preprocess_batch([text], src_lang=s, tgt_lang=t)
        inp = self._tok(batch, truncation=True, padding="longest", return_tensors="pt")
        with torch.no_grad():
            out = self._model.generate(**inp, num_beams=5, max_length=256)
        dec = self._tok.batch_decode(out, skip_special_tokens=True)
        return self._ip.postprocess_batch(dec, lang=t)[0]

# ---------------- TTS ----------------
class SarvamTTS:
    name, mode = "sarvam-tts", "online"
    def available(self): return bool(SARVAM_API_KEY)
    def run(self, text, lang):
        if lang == "sat":
            raise Unavailable("Sarvam TTS may not support Santali; verify. Ol Chiki text is NOT transliterated.")
        r = httpx.post(f"{SARVAM}/text-to-speech", headers=_hdr(), timeout=60, json={
            "inputs": [text], "target_language_code": LANGS[lang][0]})
        r.raise_for_status()
        return base64.b64decode(r.json()["audios"][0])

class LocalTTS:
    name, mode = "indic-parler-tts", "offline"
    def available(self): return False   # TODO: wire a Santali-capable local model
    def run(self, text, lang):
        raise Unavailable("No local Santali TTS integrated yet. Never fake it via Devanagari.")

# ---------------- Engine facade ----------------
def _pick(online, offline, mode):
    order = {"online": [online], "offline": [offline], "auto": [online, offline]}[mode]
    return [p for p in order if p.available()]

def _run(providers, mode, fn):
    if not providers:
        raise Unavailable(f"No provider available for mode '{mode}'")
    last = None
    for p in providers:
        try:
            t = time.perf_counter()
            res = fn(p)
            return res, p, int((time.perf_counter() - t) * 1000)
        except Exception as e:      # fall through to next provider
            last = e
    raise Unavailable(str(last))

class ASREngine:
    def transcribe(self, wav, lang, mode="auto"):
        text, p, ms = _run(_pick(SarvamASR(), IndicConformerASR(), mode), mode, lambda p: p.run(wav, lang))
        return {"text": text, "provider": p.name, "mode": p.mode, "latency_ms": ms}

class TranslationEngine:
    def translate(self, text, src, tgt, mode="auto"):
        out, p, ms = _run(_pick(SarvamMT(), IndicTrans2MT(), mode), mode, lambda p: p.run(text, src, tgt))
        return {"translation": out, "provider": p.name, "mode": p.mode, "latency_ms": ms, "confidence": None}

class TTSEngine:
    def synthesize(self, text, lang, mode="auto"):
        wav, p, ms = _run(_pick(SarvamTTS(), LocalTTS(), mode), mode, lambda p: p.run(text, lang))
        return {"audio_b64": base64.b64encode(wav).decode(), "provider": p.name, "mode": p.mode, "latency_ms": ms}

def memory_lookup(db, text, lang, threshold=0.92):
    from ..db import LanguageMemory
    rows = db.query(LanguageMemory).filter_by(language=lang, verified=True).all()
    best = max(rows, key=lambda r: SequenceMatcher(None, r.source.strip(), text.strip()).ratio(), default=None)
    if best and SequenceMatcher(None, best.source.strip(), text.strip()).ratio() >= threshold:
        return best
