import React, { useState, useRef, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import { recordWav, blobToB64 } from './utils/audio.js'

const tok = () => localStorage.getItem('token')
const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), ...(opts.headers || {}) } })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText)
  return r.json()
}
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const styles = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 20px 48px',
    minHeight: '100vh',
    fontFamily: 'Inter, system-ui, sans-serif',
    background: 'linear-gradient(180deg, #f4f1e8 0%, #edf9f7 100%)',
    color: '#153b32'
  },
  shell: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 20,
    fontFamily: 'Inter, system-ui, sans-serif',
    background: 'linear-gradient(180deg, #fefcf8 0%, #eefaf8 100%)',
    minHeight: '100vh',
    color: '#153b32'
  },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.75)', boxShadow: '0 12px 28px rgba(18,67,56,0.08)', flexWrap: 'wrap' },
  navLinks: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  brand: { fontSize: 28, fontWeight: 800, letterSpacing: 0.5, color: '#0f3b33' },
  btn: { background: 'linear-gradient(135deg, #1a7f67 0%, #0f5d52 100%)', color: '#fff', border: 0, borderRadius: 14, padding: '12px 18px', fontSize: 16, cursor: 'pointer', fontWeight: 700, boxShadow: '0 12px 20px rgba(17,98,83,0.22)' },
  btnSecondary: { background: '#eaf6f2', color: '#114a41', border: '1px solid rgba(17,74,65,0.12)', borderRadius: 14, padding: '12px 18px', fontSize: 16, cursor: 'pointer', fontWeight: 700 },
  card: { background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 20, boxShadow: '0 14px 30px rgba(18,67,56,0.08)', border: '1px solid rgba(21,59,50,0.06)' },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, background: '#f6faf9', border: '1px solid #d9e8e4', fontSize: 16, boxSizing: 'border-box', margin: '8px 0' },
  hero: { display: 'grid', gridTemplateColumns: '1.3fr 0.9fr', gap: 26, alignItems: 'stretch' },
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16, marginTop: 22 },
  feature: { background: 'rgba(255,255,255,0.8)', borderRadius: 18, padding: 18, border: '1px solid rgba(18,67,56,0.08)' },
  modeChip: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(17,74,65,0.12)', background: '#f5faf8', fontWeight: 700 },
  modeRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 },
  smallMuted: { color: '#4f6e67', fontSize: 14 },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 18 },
  metric: { background: 'linear-gradient(135deg, rgba(28,127,103,0.08), rgba(24,39,68,0.02))', borderRadius: 18, padding: 18, border: '1px solid rgba(16,88,77,0.08)' },
  link: { color: '#0f5d52', textDecoration: 'none', fontWeight: 700 },
  danger: { color: '#c13d38', fontWeight: 600 },
  success: { color: '#116a50', fontWeight: 600 }
}

const modeMeta = {
  auto: { label: 'Auto', description: 'Switches between online and offline automatically' },
  online: { label: 'Online', description: 'Uses API-based services only' },
  offline: { label: 'Offline', description: 'Uses local models only' }
}

const Badge = ({ mode }) => <b style={{ color: mode === 'offline' ? '#0b6e84' : '#116a50' }}>{mode === 'offline' ? '🔵 Offline (local)' : mode === 'online' ? '🟢 Online (API)' : '🟣 Auto mode'}</b>

function Protected({ children }) { return tok() ? children : <Navigate to="/login" /> }

function ModeToggle({ value, onChange }) {
  return <div style={styles.modeRow}>
    {Object.entries(modeMeta).map(([key, meta]) => (
      <button key={key} onClick={() => onChange(key)} style={{
        ...styles.btnSecondary,
        border: value === key ? '1px solid #1a7f67' : '1px solid rgba(17,74,65,0.12)',
        background: value === key ? '#e7f8f2' : '#f5faf8',
        color: value === key ? '#0f5d52' : '#234539',
        boxShadow: value === key ? '0 8px 18px rgba(26,127,103,0.12)' : 'none'
      }}>
        {meta.label}
      </button>
    ))}
  </div>
}

function Auth({ register }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'teacher' }), [err, setErr] = useState(''), [mode, setMode] = useState(localStorage.getItem('preferredMode') || 'auto'), nav = useNavigate()

  const saveMode = (nextMode) => {
    localStorage.setItem('preferredMode', nextMode)
    setMode(nextMode)
  }

  const go = async () => {
    try {
      let r
      if (register) {
        r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...f, language: 'sat' })
        }).then(r => r.json())
      } else {
        r = await fetch('/api/auth/login', {
          method: 'POST',
          body: new URLSearchParams({ username: f.email, password: f.password })
        }).then(r => r.json())
      }
      if (!r.access_token) throw new Error(r.detail || 'Failed to authenticate')
      localStorage.setItem('token', r.access_token)
      localStorage.setItem('preferredMode', mode)
      nav('/dashboard')
    } catch (e) { setErr(e.message) }
  }

  const set = k => e => setF({ ...f, [k]: e.target.value })

  return <div style={styles.page}>
    <div style={styles.hero}>
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg, #dff8ee, #dfeefb)', display: 'grid', placeItems: 'center', fontSize: 24 }}>🌿</div>
          <div style={styles.brand}>BHASHA-SATHI</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#4d6b63' }}>Welcome to the classroom</div>
        <h1 style={{ fontSize: 'clamp(2.2rem, 3vw, 3.5rem)', margin: '10px 0', lineHeight: 1.1 }}>Learning in every language, with AI that stays honest.</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: '#35514c', maxWidth: 650 }}>
          Translate Hindi to Santali, run live classroom speech workflows, and switch between online APIs and offline local models without losing transparency.
        </p>

        <div style={{ marginTop: 20 }}>
          <div style={styles.modeChip}>Working mode: <span style={{ color: '#0e5f52' }}>{modeMeta[mode].label}</span></div>
          <ModeToggle value={mode} onChange={saveMode} />
        </div>

        <div style={styles.featureGrid}>
          {[
            ['🎤 Live classroom', 'Teacher and student audio flows with instant translation and feedback.'],
            ['🌐 Smart translation', 'Hindi, Santali, and English translation with source/target script control.'],
            ['🧠 Memory layer', 'Verified classroom corrections can be stored for future reuse.'],
            ['📡 Honest AI mode', 'Online/offline fallback with clear status and no fake results.']
          ].map(([title, body]) => (
            <div key={title} style={styles.feature}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{title.split(' ')[0]}</div>
              <strong>{title}</strong>
              <p style={{ ...styles.smallMuted, marginBottom: 0, lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#4d6b63', marginBottom: 6 }}>
          {register ? 'Create account' : 'Welcome back'}
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: 32 }}>{register ? 'Start your learning journey' : 'Sign in to continue'}</h2>

        {register && <input style={styles.input} placeholder="Full name" value={f.name} onChange={set('name')} />}
        <input style={styles.input} placeholder="Email address" value={f.email} onChange={set('email')} />
        <input style={styles.input} type="password" placeholder="Password" value={f.password} onChange={set('password')} />
        {register && <select style={styles.input} value={f.role} onChange={set('role')}>
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
        </select>}

        <button style={{ ...styles.btn, width: '100%' }} onClick={go}>{register ? 'Register account' : 'Login'}</button>

        <div style={{ marginTop: 16, textAlign: 'center', fontWeight: 600 }}>
          <Link to={register ? '/login' : '/register'} style={styles.link}>{register ? 'Already have an account? Sign in' : 'Need an account? Create one'}</Link>
        </div>

        {err && <div style={{ ...styles.card, marginTop: 16, background: '#fff4f3', borderColor: 'rgba(193,61,56,0.15)', color: '#8f2f2a' }}>{err}</div>}

        <div style={{ marginTop: 18, fontSize: 14, color: '#58746d' }}>
          Demo access: <strong>demo@bhashasathi.in</strong> / <strong>demo123</strong>
        </div>
      </div>
    </div>
  </div>
}

function Shell({ children }) {
  const nav = useNavigate(), location = useLocation()
  const links = [
    ['/dashboard', 'Dashboard'], ['/classroom', 'Classroom'], ['/translate', 'Translate'],
    ['/ai-chat', 'AI Chat'], ['/lessons', 'Lessons'], ['/flashcards', 'Flashcards'],
    ['/quiz', 'Quiz'], ['/analytics', 'Analytics'], ['/offline', 'Offline Center'], ['/memory', 'Language Memory']
  ]
  return <div style={styles.shell}>
    <nav style={styles.nav}>
      <div style={styles.navLinks}>
        <div style={styles.brand}>BHASHA-SATHI</div>
        {links.map(([path, label]) => (
          <Link key={path} to={path} style={{ ...styles.link, padding: '8px 10px', borderRadius: 8, whiteSpace: 'nowrap', background: location.pathname === path ? '#e2f3ed' : 'transparent' }}>{label}</Link>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ ...styles.modeChip, background: '#edf9f2' }}>{modeMeta[localStorage.getItem('preferredMode') || 'auto'].label}</span>
        <a href="#" onClick={(e) => { e.preventDefault(); localStorage.clear(); nav('/login') }} style={{ ...styles.link }}>Logout</a>
      </div>
    </nav>
    {children}
  </div>
}

function Dashboard() {
  const [me, setMe] = useState(null), [h, setH] = useState(null), [offline, setOffline] = useState(null)
  const [workingMode, setWorkingMode] = useState(localStorage.getItem('preferredMode') || 'auto')
  const [copilotForm, setCopilotForm] = useState({ topic: 'plants', grade: '3', subject: 'EVS', language: 'hi' })
  const [copilot, setCopilot] = useState(null)
  const [profileSkills, setProfileSkills] = useState({ reading: 80, vocabulary: 60, listening: 70, speaking: 65, evs: 55 })
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    api('/auth/me').then(setMe)
    fetch('/api/health').then(r => r.json()).then(setH)
    api('/offline/status').then(r => setOffline(r.offline || r)).catch(() => setOffline(null))
  }, [])

  const generateCopilot = async () => {
    try {
      const data = await post('/ai/copilot', copilotForm)
      setCopilot(data)
    } catch (e) {
      setCopilot({ error: e.message })
    }
  }

  const generateProfile = async () => {
    try {
      const data = await post('/learning/profile', { skills: profileSkills })
      setProfile(data)
    } catch (e) {
      setProfile({ error: e.message })
    }
  }

  const setMode = (mode) => {
    localStorage.setItem('preferredMode', mode)
    setWorkingMode(mode)
  }

  const summary = [
    { label: 'Internet', value: h ? (h.internet ? 'Connected' : 'Offline') : 'Checking…', tone: h?.internet ? styles.success : styles.danger },
    { label: 'ASR', value: h ? (h.asr.online ? 'Online ready' : 'Local only') : 'Checking…', tone: h?.asr.online ? styles.success : styles.smallMuted },
    { label: 'MT', value: h ? (h.translation.online ? 'Online ready' : 'Local only') : 'Checking…', tone: h?.translation.online ? styles.success : styles.smallMuted }
  ]

  const healthCards = [
    { label: 'Network', status: h?.internet ? 'Connected' : 'Offline', color: h?.internet ? '#1d8c62' : '#c84e49', icon: '📶' },
    { label: 'ASR', status: h?.asr?.online ? 'Online ready' : 'Offline only', color: h?.asr?.online ? '#1d8c62' : '#5e7a7f', icon: '🎙️' },
    { label: 'Translation', status: h?.translation?.online ? 'Online ready' : 'Offline only', color: h?.translation?.online ? '#1d8c62' : '#5e7a7f', icon: '🌐' },
    { label: 'TTS', status: h?.tts?.online ? 'Online ready' : 'Offline only', color: h?.tts?.online ? '#1d8c62' : '#5e7a7f', icon: '🔊' }
  ]

  const systemPulse = h ? Object.values(h).filter(Boolean).length >= 3 ? 'Healthy' : 'Partial' : 'Checking'

  return <Shell>
    <div style={{ ...styles.card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d' }}>Overview</div>
      <h2 style={{ margin: '8px 0 4px', fontSize: 38 }}>Welcome, {me?.name || 'teacher'} 👋</h2>
      <p style={{ ...styles.smallMuted, marginTop: 0, marginBottom: 12, fontSize: 18 }}>Your teaching workspace is ready for language access, classroom speech, and verified memory.</p>
      <div style={styles.metricGrid}>
        {summary.map(item => <div key={item.label} style={styles.metric}><div style={{ ...styles.smallMuted, marginBottom: 8 }}>{item.label}</div><div style={{ fontSize: 24, fontWeight: 800, ...item.tone }}>{item.value}</div></div>)}
      </div>
    </div>

    <div style={{ ...styles.card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d', marginBottom: 10 }}>Advanced features</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        {[
          ['🤖 AI Teacher Copilot', 'Generates lessons, scripts, quizzes, and flashcards for any topic.'],
          ['🧠 Adaptive Learning', 'Finds weak skills and recommends the next lesson path.'],
          ['📴 Offline Intelligence', 'Checks local readiness and keeps the classroom usable without internet.']
        ].map(([title, body]) => (
          <div key={title} style={{ background: '#f8fdfb', border: '1px solid rgba(17,74,65,0.08)', borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{title.split(' ')[0]}</div>
            <strong>{title}</strong>
            <p style={{ ...styles.smallMuted, marginBottom: 0, lineHeight: 1.6 }}>{body}</p>
          </div>
        ))}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 18, marginBottom: 18 }}>
      <div style={{ ...styles.card }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d', marginBottom: 10 }}>AI teacher copilot</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <input style={styles.input} value={copilotForm.topic} onChange={e => setCopilotForm({ ...copilotForm, topic: e.target.value })} placeholder="Topic" />
          <input style={styles.input} value={copilotForm.grade} onChange={e => setCopilotForm({ ...copilotForm, grade: e.target.value })} placeholder="Grade" />
          <input style={styles.input} value={copilotForm.subject} onChange={e => setCopilotForm({ ...copilotForm, subject: e.target.value })} placeholder="Subject" />
          <select style={styles.input} value={copilotForm.language} onChange={e => setCopilotForm({ ...copilotForm, language: e.target.value })}>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
            <option value="sat">Santali</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={styles.btn} onClick={generateCopilot}>Generate lesson</button>
        </div>

        {copilot && !copilot.error && (
          <div style={{ ...styles.card, marginTop: 18, background: '#f8fffb', border: '1px solid rgba(17,74,65,0.08)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{copilot.lesson?.title || 'Lesson plan'}</div>
            <p style={{ ...styles.smallMuted, lineHeight: 1.7 }}>{copilot.lesson?.text}</p>
            <div style={{ fontWeight: 800, margin: '10px 0 6px' }}>Objectives</div>
            <ul style={{ marginTop: 0, paddingLeft: 18, color: '#2f4e48', lineHeight: 1.8 }}>
              {(copilot.lesson?.objectives || []).map((o, i) => <li key={i}>{o}</li>)}
            </ul>
            <div style={{ fontWeight: 800, margin: '10px 0 6px' }}>Quiz</div>
            <ul style={{ marginTop: 0, paddingLeft: 18, color: '#2f4e48', lineHeight: 1.8 }}>
              {(copilot.quiz || []).slice(0, 2).map((q, i) => <li key={i}>{q.question}</li>)}
            </ul>
          </div>
        )}

        {copilot && copilot.error && <div style={{ ...styles.card, marginTop: 18, background: '#fff3f2', borderColor: 'rgba(193,61,56,0.12)', color: '#8f2f2a' }}>{copilot.error}</div>}
      </div>

      <div style={{ ...styles.card }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d', marginBottom: 10 }}>Adaptive learning profile</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {Object.entries(profileSkills).map(([key, value]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 6, textTransform: 'capitalize' }}>
                <span>{key}</span><span>{value}%</span>
              </div>
              <input type="range" min="0" max="100" value={value} onChange={e => setProfileSkills({ ...profileSkills, [key]: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
        <button style={{ ...styles.btn, marginTop: 14 }} onClick={generateProfile}>Analyze learning</button>

        {profile && !profile.error && (
          <div style={{ ...styles.card, marginTop: 18, background: '#f8fbff', border: '1px solid rgba(17,74,65,0.08)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Recommendations</div>
            <ul style={{ marginTop: 0, paddingLeft: 18, color: '#2f4e48', lineHeight: 1.8 }}>
              {(profile.recommendations || []).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            <div style={{ marginTop: 10, color: '#2c5d52', fontWeight: 700 }}>Focus next: {profile.next_lesson?.focus || 'reading'}</div>
          </div>
        )}

        {profile && profile.error && <div style={{ ...styles.card, marginTop: 18, background: '#fff3f2', borderColor: 'rgba(193,61,56,0.12)', color: '#8f2f2a' }}>{profile.error}</div>}
      </div>
    </div>

    <div style={{ ...styles.card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d', marginBottom: 10 }}>Offline intelligence</div>
      <p style={{ ...styles.smallMuted, lineHeight: 1.6, marginTop: 0 }}>Choose Offline to use local lesson planning, learning analysis, and saved verified phrases. Audio recognition, model translation, and speech playback still require installed local models.</p>
      <ModeToggle value={workingMode} onChange={setMode} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginTop: 16 }}>
        {offline ? (
          Object.entries(offline.services || {}).map(([name, ready]) => (
            <div key={name} style={{ ...styles.metric, background: ready ? 'linear-gradient(135deg, rgba(29,140,98,0.08), rgba(24,39,68,0.02))' : 'linear-gradient(135deg, rgba(200,78,73,0.08), rgba(24,39,68,0.02))' }}>
              <div style={{ ...styles.smallMuted, textTransform: 'capitalize', marginBottom: 8 }}>{({ verified_translation_memory: 'Verified phrase memory', lesson_copilot: 'Lesson copilot', learning_profile: 'Adaptive learning', asr: 'Offline speech recognition', translation: 'Offline translation model', tts: 'Offline speech playback' })[name] || name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: ready ? '#116a50' : '#b24540' }}>{ready ? 'Ready' : 'Not ready'}</div>
            </div>
          ))
        ) : (
          <div style={{ ...styles.smallMuted, gridColumn: '1 / -1' }}>Checking offline status…</div>
        )}
      </div>
      {offline && <div style={{ marginTop: 12, color: '#2b534d', fontWeight: 600 }}>{offline.message}</div>}
      {workingMode === 'offline' && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <span style={{ ...styles.success }}>Offline mode is active. Translation uses saved verified phrases when available.</span>
        <Link to="/translate" style={{ ...styles.btnSecondary, textDecoration: 'none' }}>Try offline translation</Link>
      </div>}
    </div>

    <div style={{ ...styles.card, display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>System health</h3>
          <div style={{
            background: systemPulse === 'Healthy' ? '#eafaf3' : '#fff7dd',
            color: systemPulse === 'Healthy' ? '#14614d' : '#9a6a12',
            border: `1px solid ${systemPulse === 'Healthy' ? '#bce7d3' : '#f2d68f'}`,
            borderRadius: 999,
            padding: '7px 12px',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 1
          }}>{systemPulse}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {healthCards.map(card => (
            <div key={card.label} style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(241,249,247,0.9))',
              border: '1px solid rgba(17,74,65,0.08)',
              borderRadius: 20,
              padding: 16,
              boxShadow: '0 10px 24px rgba(18,67,56,0.04)',
              transform: 'translateY(0)',
              transition: 'all 0.18s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 24 }}>{card.icon}</div>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: card.color, boxShadow: `0 0 0 4px ${card.color}22` }} />
              </div>
              <div style={{ ...styles.smallMuted, textTransform: 'uppercase', letterSpacing: 1.1 }}>{card.label}</div>
              <div style={{ fontWeight: 800, fontSize: 20, marginTop: 6, color: card.color }}>{card.status}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Backend status</h3>
        <div style={{ background: 'linear-gradient(135deg, rgba(26,127,103,0.12), rgba(18,67,56,0.03))', borderRadius: 20, padding: 18, border: '1px solid rgba(17,74,65,0.08)', boxShadow: '0 10px 24px rgba(18,67,56,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: h?.internet ? '#1d8c62' : '#c84e49', boxShadow: `0 0 0 5px ${h?.internet ? '#dff7ee' : '#ffe3e1'}` }} />
            <strong>{h?.internet ? 'API gateway online' : 'Network unavailable'}</strong>
          </div>
          <div style={{ lineHeight: 1.9, color: '#2e4d46', fontSize: 15 }}>
            <div>• ASR: {h?.asr?.online ? 'online pipeline active' : 'local fallback only'}</div>
            <div>• Translation: {h?.translation?.online ? 'online pipeline active' : 'local fallback only'}</div>
            <div>• TTS: {h?.tts?.online ? 'online pipeline active' : 'local fallback only'}</div>
            <div>• Mode: <span style={{ fontWeight: 800 }}>{localStorage.getItem('preferredMode') || 'auto'}</span></div>
          </div>
        </div>
      </div>
    </div>
  </Shell>
}

function Translate() {
  const [text, setText] = useState('आज हम पौधों के बारे में सीखेंगे।'), [r, setR] = useState(null), [fix, setFix] = useState(''), [err, setErr] = useState(''), [mode, setMode] = useState(localStorage.getItem('preferredMode') || 'auto')

  useEffect(() => { localStorage.setItem('preferredMode', mode) }, [mode])

  const run = async () => { setErr(''); try { setR(await post('/translate', { text, source_language: 'hi', target_language: 'sat', script: 'ol_chiki', mode })) } catch (e) { setErr(e.message) } }
  const save = async () => { await post('/memory/verify', { source: text, target: fix, language: 'sat', script: 'ol_chiki' }); setErr('Saved to Language Memory ✓') }

  return <Shell>
    <div style={{ ...styles.card }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d' }}>Translation hub</div>
      <h2 style={{ margin: '8px 0 16px', fontSize: 34 }}>Hindi → Santali (Ol Chiki)</h2>
      <textarea style={{ ...styles.input, minHeight: 110, resize: 'vertical' }} value={text} onChange={e => setText(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        <div style={{ ...styles.smallMuted, marginBottom: 8 }}>Working mode</div>
        <ModeToggle value={mode} onChange={setMode} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
        <button style={styles.btn} onClick={run}>Translate</button>
        <button style={styles.btnSecondary} onClick={() => setText('')}>Clear</button>
      </div>
      <p style={{ color: '#9a3a35', minHeight: 20, marginBottom: 0 }}>{err}</p>

      {r && <div style={{ ...styles.card, marginTop: 18, background: '#f9fffd', border: '1px solid rgba(22,135,110,0.12)' }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.5 }}>{r.translation}</div>
        <p style={{ margin: '10px 0 18px' }}><Badge mode={r.mode} /> · {r.provider} · {r.latency_ms} ms · {r.verified ? '✓ teacher-verified' : 'AI estimate, unverified'}</p>
        <input style={styles.input} placeholder="Correct translation (teacher)" value={fix} onChange={e => setFix(e.target.value)} />
        <button style={{ ...styles.btn, marginTop: 8 }} onClick={save}>Save correction</button>
      </div>}
    </div>
  </Shell>
}

function Classroom() {
  const [log, setLog] = useState([]), [rec, setRec] = useState(null), ws = useRef(), [status, setStatus] = useState('connecting'), [mode, setMode] = useState(localStorage.getItem('preferredMode') || 'auto')

  useEffect(() => { localStorage.setItem('preferredMode', mode) }, [mode])

  useEffect(() => {
    const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/classroom?token=${tok()}`)
    s.onopen = () => setStatus('connected')
    s.onclose = () => setStatus('disconnected')
    s.onmessage = e => {
      const m = JSON.parse(e.data)
      setLog(l => [m, ...l])
      if (m.audio) new Audio('data:audio/wav;base64,' + m.audio).play()
    }
    ws.current = s
    return () => s.close()
  }, [])

  const toggle = async type => {
    if (!rec) {
      const device = await recordWav()
      setRec(device)
      return
    }
    const blob = await rec.stop(); setRec(null)
    ws.current.send(JSON.stringify({ type, data: await blobToB64(blob), mode }))
  }

  return <Shell>
    <div style={{ ...styles.card }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#58746d' }}>Live classroom</div>
      <h2 style={{ margin: '8px 0 8px', fontSize: 34 }}>Connection: {status}</h2>
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...styles.smallMuted, marginBottom: 8 }}>Working mode</div>
        <ModeToggle value={mode} onChange={setMode} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button style={styles.btn} onClick={() => toggle('teacher_audio')}>{rec ? '⏹ Stop & send teacher audio' : '🎤 Teacher: speak Hindi'}</button>
        <button style={styles.btnSecondary} onClick={() => toggle('student_audio')}>{rec ? '⏹ Stop & send student audio' : '🎤 Student: answer'}</button>
      </div>

      {log.map((m, i) => <div key={i} style={{ ...styles.card, marginTop: 16, background: '#f7fcfa' }}>
        {m.type === 'translation' && <>
          <div style={{ fontWeight: 700 }}>{m.source_text}</div>
          <div style={{ fontSize: 28, margin: '8px 0' }}>{m.text}</div>
          <small>ASR {m.latency_ms?.asr} · MT {m.latency_ms?.translation} · TTS {m.latency_ms?.tts ?? '—'} · total {m.latency_ms?.total} ms · {Object.entries(m.modes || {}).map(([k, v]) => `${k}:${v}`).join(' ')}</small>
          {m.tts_error && <p style={{ color: '#9a3a35', marginBottom: 0 }}>No audio: {m.tts_error}</p>}
        </>}
        {m.type === 'student_reply' && <><b>{m.student}:</b> {m.text}<br /><i>{m.translation_hi}</i></>}
        {m.type === 'error' && <span style={{ color: '#b6453d', fontWeight: 700 }}>{m.message}</span>}
      </div>)}
    </div>
  </Shell>
}

function useCopilotLesson() {
  const [form, setForm] = useState({ topic: '', grade: '3', subject: 'EVS', language: 'hi' })
  const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const generate = async () => {
    if (!form.topic.trim()) { setError('Enter a topic first.'); return }
    setBusy(true); setError('')
    try { setResult(await post('/ai/copilot', form)) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return { form, setForm, result, error, busy, generate }
}

function CopilotForm({ form, setForm, onGenerate, busy, action = 'Generate' }) {
  const update = key => event => setForm({ ...form, [key]: event.target.value })
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
      <input style={styles.input} value={form.topic} onChange={update('topic')} placeholder="Lesson topic" />
      <input style={styles.input} value={form.grade} onChange={update('grade')} placeholder="Grade" />
      <input style={styles.input} value={form.subject} onChange={update('subject')} placeholder="Subject" />
      <select style={styles.input} value={form.language} onChange={update('language')}>
        <option value="hi">Hindi</option><option value="en">English</option><option value="sat">Santali</option>
      </select>
    </div>
    <button style={styles.btn} onClick={onGenerate} disabled={busy}>{busy ? 'Working…' : action}</button>
  </>
}

function AIChat() {
  const copilot = useCopilotLesson(), [question, setQuestion] = useState('')
  const ask = () => {
    copilot.setForm({ ...copilot.form, topic: question })
    if (!question.trim()) return
    post('/ai/copilot', { ...copilot.form, topic: question }).then(copilotResult => {
      copilot.setForm({ ...copilot.form, topic: question })
      window.dispatchEvent(new CustomEvent('copilot-chat-result', { detail: copilotResult }))
    }).catch(error => window.dispatchEvent(new CustomEvent('copilot-chat-error', { detail: error.message })))
  }
  const [reply, setReply] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    const onResult = event => { setReply(event.detail); setError('') }
    const onError = event => setError(event.detail)
    window.addEventListener('copilot-chat-result', onResult)
    window.addEventListener('copilot-chat-error', onError)
    return () => {
      window.removeEventListener('copilot-chat-result', onResult)
      window.removeEventListener('copilot-chat-error', onError)
    }
  }, [])
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>AI Chat</h2>
    <p style={styles.smallMuted}>Ask the teaching copilot for a classroom-ready explanation and activity.</p>
    <textarea style={{ ...styles.input, minHeight: 90 }} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What should the class learn today?" />
    <CopilotForm form={copilot.form} setForm={copilot.setForm} onGenerate={() => { setQuestion(copilot.form.topic); copilot.generate().then(() => {}) }} busy={copilot.busy} action="Generate response" />
    <button style={{ ...styles.btn, marginTop: 10 }} onClick={ask}>Ask copilot</button>
    {error && <p style={styles.danger}>{error}</p>}
    {reply && <div style={{ ...styles.metric, marginTop: 18 }}><h3>{reply.lesson?.title}</h3><p>{reply.lesson?.text}</p><strong>Classroom activity</strong><p>{reply.lesson?.teacher_script}</p></div>}
    {copilot.error && <p style={styles.danger}>{copilot.error}</p>}
  </section></Shell>
}

function Lessons() {
  const copilot = useCopilotLesson()
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Lesson Builder</h2>
    <CopilotForm {...copilot} onGenerate={copilot.generate} action="Create lesson" />
    {copilot.error && <p style={styles.danger}>{copilot.error}</p>}
    {copilot.result && <div style={{ ...styles.metric, marginTop: 18 }}>
      <h3>{copilot.result.lesson.title}</h3><p>{copilot.result.lesson.text}</p>
      <h4>Learning objectives</h4><ul>{copilot.result.lesson.objectives.map(item => <li key={item}>{item}</li>)}</ul>
      <h4>Teacher script</h4><p>{copilot.result.lesson.teacher_script}</p>
      <h4>Resources</h4><ul>{copilot.result.resources.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
  </section></Shell>
}

function Flashcards() {
  const copilot = useCopilotLesson(), [index, setIndex] = useState(0), [showBack, setShowBack] = useState(false)
  const cards = copilot.result?.flashcards || []
  const generate = async () => { await copilot.generate(); setIndex(0); setShowBack(false) }
  const card = cards[index]
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Flashcards</h2>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <input style={{ ...styles.input, maxWidth: 360 }} value={copilot.form.topic} onChange={e => copilot.setForm({ ...copilot.form, topic: e.target.value })} placeholder="Topic" />
      <button style={styles.btn} onClick={generate} disabled={copilot.busy}>{copilot.busy ? 'Creating…' : 'Create flashcards'}</button>
    </div>
    {copilot.error && <p style={styles.danger}>{copilot.error}</p>}
    {card && <div style={{ ...styles.metric, marginTop: 20, maxWidth: 620 }}>
      <div style={styles.smallMuted}>Card {index + 1} of {cards.length}</div>
      <button onClick={() => setShowBack(!showBack)} style={{ ...styles.card, width: '100%', minHeight: 190, marginTop: 12, cursor: 'pointer', fontSize: 24, fontWeight: 800 }}>
        {showBack ? card.back : card.front}
      </button>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button style={styles.btnSecondary} onClick={() => { setIndex((index + cards.length - 1) % cards.length); setShowBack(false) }}>Previous</button>
        <button style={styles.btnSecondary} onClick={() => { setIndex((index + 1) % cards.length); setShowBack(false) }}>Next</button>
      </div>
    </div>}
  </section></Shell>
}

function Quiz() {
  const copilot = useCopilotLesson(), [answers, setAnswers] = useState({})
  const questions = copilot.result?.quiz || []
  const generate = async () => { await copilot.generate(); setAnswers({}) }
  const score = questions.reduce((total, item, index) => total + (answers[index] === item.answer ? 1 : 0), 0)
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Topic Quiz</h2>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <input style={{ ...styles.input, maxWidth: 360 }} value={copilot.form.topic} onChange={e => copilot.setForm({ ...copilot.form, topic: e.target.value })} placeholder="Topic" />
      <button style={styles.btn} onClick={generate} disabled={copilot.busy}>{copilot.busy ? 'Preparing…' : 'Generate quiz'}</button>
    </div>
    {copilot.error && <p style={styles.danger}>{copilot.error}</p>}
    {questions.map((item, index) => <fieldset key={item.question} style={{ border: 0, borderTop: '1px solid #d9e8e4', marginTop: 18, padding: '18px 0 0' }}>
      <legend style={{ fontWeight: 800 }}>{index + 1}. {item.question}</legend>
      {item.options.map(option => <label key={option} style={{ display: 'block', padding: '7px 0' }}><input type="radio" name={`question-${index}`} checked={answers[index] === option} onChange={() => setAnswers({ ...answers, [index]: option })} /> {option}</label>)}
    </fieldset>)}
    {questions.length > 0 && Object.keys(answers).length === questions.length && <p style={{ ...styles.success, marginTop: 18 }}>Score: {score} / {questions.length}</p>}
  </section></Shell>
}

function Analytics() {
  const [skills, setSkills] = useState({ reading: 80, vocabulary: 60, listening: 70, speaking: 65, evs: 55 })
  const [profile, setProfile] = useState(null), [error, setError] = useState('')
  const analyze = async () => {
    setError('')
    try { setProfile(await post('/learning/profile', { skills })) }
    catch (e) { setError(e.message) }
  }
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Learning Analytics</h2>
    <p style={styles.smallMuted}>Adjust skill scores to generate a learning profile and next-step recommendations.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
      {Object.entries(skills).map(([name, value]) => <label key={name} style={{ textTransform: 'capitalize' }}>{name}: <strong>{value}%</strong><input type="range" min="0" max="100" value={value} onChange={e => setSkills({ ...skills, [name]: Number(e.target.value) })} style={{ display: 'block', width: '100%' }} /></label>)}
    </div>
    <button style={{ ...styles.btn, marginTop: 18 }} onClick={analyze}>Analyze profile</button>
    {error && <p style={styles.danger}>{error}</p>}
    {profile && <div style={{ ...styles.metric, marginTop: 18 }}><h3>Recommended next lesson: {profile.next_lesson.topic}</h3><p>Focus: {profile.next_lesson.focus}</p><strong>Strengths</strong><p>{profile.strengths.join(', ')}</p><strong>Needs practice</strong><p>{profile.weak_areas.join(', ')}</p><ul>{profile.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div>}
  </section></Shell>
}

function OfflineCenter() {
  const [status, setStatus] = useState(null), [mode, setMode] = useState(localStorage.getItem('preferredMode') || 'auto'), [error, setError] = useState('')
  useEffect(() => { api('/offline/status').then(result => setStatus(result.offline || result)).catch(e => setError(e.message)) }, [])
  const selectMode = value => { localStorage.setItem('preferredMode', value); setMode(value) }
  const names = { asr: 'Offline speech recognition', translation: 'Offline translation model', tts: 'Offline speech playback', verified_translation_memory: 'Verified phrase memory', lesson_copilot: 'Lesson copilot', learning_profile: 'Adaptive learning' }
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Offline Center</h2>
    <p style={styles.smallMuted}>Select a working mode and see which local services are actually available.</p>
    <ModeToggle value={mode} onChange={selectMode} />
    {error && <p style={styles.danger}>{error}</p>}
    {status && <>
      <div style={{ ...styles.metricGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {Object.entries(status.services || {}).map(([key, ready]) => <div key={key} style={styles.metric}><div style={styles.smallMuted}>{names[key] || key}</div><strong style={{ color: ready ? '#116a50' : '#b24540' }}>{ready ? 'Ready' : 'Not ready'}</strong></div>)}
      </div>
      <p style={{ ...styles.smallMuted, marginTop: 16 }}>{status.message}</p>
      <p style={styles.success}>{mode === 'offline' ? 'Offline mode is selected.' : `${modeMeta[mode].label} mode is selected.`}</p>
    </>}
  </section></Shell>
}

function LanguageMemory() {
  const [entries, setEntries] = useState([]), [form, setForm] = useState({ source: '', target: '', language: 'sat', script: 'ol_chiki' })
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const refresh = () => api('/memory').then(setEntries).catch(e => setError(e.message))
  useEffect(() => { refresh() }, [])
  const save = async event => {
    event.preventDefault(); setError(''); setNotice('')
    try {
      await post('/memory/verify', form)
      setForm({ ...form, source: '', target: '' }); setNotice('Verified phrase saved.'); refresh()
    } catch (e) { setError(e.message) }
  }
  return <Shell><section style={styles.card}>
    <h2 style={{ marginTop: 0 }}>Language Memory</h2>
    <p style={styles.smallMuted}>Teacher-verified phrases are reused for matching translations, including in Offline mode.</p>
    <form onSubmit={save}>
      <textarea required style={{ ...styles.input, minHeight: 80 }} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Source phrase" />
      <textarea required style={{ ...styles.input, minHeight: 80 }} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="Verified translation" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select style={styles.input} value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}><option value="sat">Santali</option><option value="hi">Hindi</option><option value="en">English</option></select>
        <select style={styles.input} value={form.script} onChange={e => setForm({ ...form, script: e.target.value })}><option value="ol_chiki">Ol Chiki</option><option value="devanagari">Devanagari</option><option value="latin">Latin</option></select>
        <button style={styles.btn} type="submit">Save verified phrase</button>
      </div>
    </form>
    {error && <p style={styles.danger}>{error}</p>}{notice && <p style={styles.success}>{notice}</p>}
    <h3>Saved phrases ({entries.length})</h3>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr><th style={{ padding: 10 }}>Source</th><th style={{ padding: 10 }}>Translation</th><th style={{ padding: 10 }}>Language</th><th style={{ padding: 10 }}>Script</th></tr></thead><tbody>
      {entries.map(entry => <tr key={entry.id}><td style={{ padding: 10, borderTop: '1px solid #d9e8e4' }}>{entry.source}</td><td style={{ padding: 10, borderTop: '1px solid #d9e8e4' }}>{entry.target}</td><td style={{ padding: 10, borderTop: '1px solid #d9e8e4' }}>{entry.language}</td><td style={{ padding: 10, borderTop: '1px solid #d9e8e4' }}>{entry.script}</td></tr>)}
    </tbody></table></div>
  </section></Shell>
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Auth />} />
    <Route path="/register" element={<Auth register />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
    <Route path="/translate" element={<Protected><Translate /></Protected>} />
    <Route path="/classroom" element={<Protected><Classroom /></Protected>} />
    <Route path="/ai-chat" element={<Protected><AIChat /></Protected>} />
    <Route path="/lessons" element={<Protected><Lessons /></Protected>} />
    <Route path="/flashcards" element={<Protected><Flashcards /></Protected>} />
    <Route path="/quiz" element={<Protected><Quiz /></Protected>} />
    <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
    <Route path="/offline" element={<Protected><OfflineCenter /></Protected>} />
    <Route path="/memory" element={<Protected><LanguageMemory /></Protected>} />
    <Route path="/" element={tok() ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
    <Route path="*" element={<Navigate to={tok() ? '/dashboard' : '/login'} />} />
  </Routes>
}
