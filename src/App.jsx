import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import {
  Dumbbell, Ruler, BarChart3, History, Plus, Minus, Check, ChevronDown,
  ChevronUp, Flame, Calendar, Award, Target, Clock, SkipForward, Edit3,
  Trash2, RotateCcw, MessageSquare, Zap, ArrowUp, ArrowDown, TrendingUp,
  Cloud, CloudOff, LogIn, LogOut, Loader, Sparkles, Brain, RefreshCw
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Area, AreaChart
} from "recharts";
import { useFirebaseSync } from "./useFirebaseSync";
import { hasApiKey, buildContext, chatComplete, SYSTEM_PROMPTS } from "./openai";

const AiCoach = lazy(() => import("./AiCoach"));

/* ---------------- plan ---------------- */
const DEFAULT_DAYS = [
  { key: "pushA", name: "Push A", sub: "Chest Focus", ex: [
    { n: "Incline DB Press", s: 4, r: "8–12" }, { n: "Flat Chest Press", s: 3, r: "8–12" },
    { n: "Incline Cable Fly", s: 3, r: "12–15" }, { n: "Seated DB Shoulder Press", s: 3, r: "10–12" },
    { n: "Lateral Raises", s: 4, r: "15–20" }, { n: "Overhead Triceps Ext", s: 3, r: "10–12" },
    { n: "Triceps Pushdown", s: 3, r: "12–15" }, { n: "Face Pulls", s: 3, r: "20" },
  ]},
  { key: "pullA", name: "Pull A", sub: "Back Width", ex: [
    { n: "Lat Pulldown (medium)", s: 4, r: "10–12" }, { n: "Pull-Ups", s: 3, r: "max" },
    { n: "Chest-Supported Row", s: 3, r: "10–12" }, { n: "Straight-Arm Pulldown", s: 3, r: "12–15" },
    { n: "Face Pulls", s: 3, r: "15–20" }, { n: "Rear Delt Fly", s: 3, r: "15–20" },
    { n: "Barbell Curl", s: 3, r: "10–12" }, { n: "Hammer Curl", s: 3, r: "10–12" },
  ]},
  { key: "legsA", name: "Legs A", sub: "Quad Focus", ex: [
    { n: "Leg Press", s: 4, r: "10–12" }, { n: "Hack / Goblet Squat", s: 3, r: "10–12" },
    { n: "Walking Lunges", s: 3, r: "10–12" }, { n: "Leg Extension", s: 3, r: "12–15" },
    { n: "Seated Leg Curl", s: 3, r: "12–15" }, { n: "Standing Calf Raise", s: 4, r: "15–20" },
    { n: "Lower-Back Circuit", s: 2, r: "rounds" },
  ]},
  { key: "pushB", name: "Push B", sub: "Shoulder Focus", ex: [
    { n: "Seated Overhead Press", s: 4, r: "8–10" }, { n: "Lateral Raises", s: 4, r: "15–20" },
    { n: "Incline DB Press", s: 3, r: "10–12" }, { n: "Cable Lateral Raise", s: 3, r: "15–20" },
    { n: "Reverse Pec Deck", s: 3, r: "15–20" }, { n: "Close-Grip Press", s: 3, r: "10–12" },
    { n: "Triceps Pushdown", s: 3, r: "12–15" }, { n: "Face Pulls", s: 3, r: "20" },
  ]},
  { key: "pullB", name: "Pull B", sub: "Back + Arms", ex: [
    { n: "Lat Pulldown (close)", s: 4, r: "10–12" }, { n: "Seated Cable Row", s: 3, r: "10–12" },
    { n: "Single-Arm DB Row", s: 3, r: "10–12" }, { n: "Straight-Arm Pulldown", s: 3, r: "12–15" },
    { n: "DB Shrugs", s: 3, r: "12–15" }, { n: "Rear Delt Fly", s: 3, r: "15–20" },
    { n: "Barbell Curl", s: 3, r: "10–12" }, { n: "Incline DB Curl", s: 3, r: "12–15" },
  ]},
  { key: "legsB", name: "Legs B", sub: "Hamstring / Glute", ex: [
    { n: "Hip Thrust", s: 4, r: "10–12" }, { n: "Seated Leg Curl", s: 4, r: "12–15" },
    { n: "Leg Press (feet high)", s: 3, r: "10–12" }, { n: "Romanian Deadlift (light)", s: 3, r: "10–12" },
    { n: "Leg Extension", s: 3, r: "12–15" }, { n: "Standing Calf Raise", s: 4, r: "15–20" },
    { n: "Arm Finisher", s: 3, r: "12–15" },
  ]},
  { key: "rest", name: "Rest", sub: "Recovery", ex: [] },
];
const WEEK_MAP = { 0: "rest", 1: "pushA", 2: "pullA", 3: "legsA", 4: "pushB", 5: "pullB", 6: "legsB" };
const REST_PRESETS = [60, 90, 120, 180];
const METRICS = [
  { k: "weight", label: "Weight", unit: "kg", goal: true },
  { k: "chest", label: "Chest", unit: "cm" },
  { k: "bicep", label: "Biceps", unit: "cm" },
  { k: "waist", label: "Waist", unit: "cm" },
];

/* ---------------- helpers ---------------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
const dayLabel = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const startOfWeek = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; };
const topRep = (r) => { const n = (r.match(/\d+/g) || []).map(Number); return n.length ? Math.max(...n) : null; };

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination); o.type = "sine"; o.frequency.value = 760;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch (e) {}
}

function useCountUp(value, dur = 550) {
  const [v, setV] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current, to = value, t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else ref.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return v;
}

/* ---------------- inputs ---------------- */
function NumField({ value, onChange, step, label }) {
  const num = parseFloat(value) || 0;
  const lower = label.toLowerCase();
  return (
    <div className="numwrap">
      <span className="numlabel">{label}</span>
      <div className="numfield">
        <button type="button" aria-label={`Decrease ${lower}`} onClick={() => onChange(String(+Math.max(0, num - step).toFixed(2)))}><Minus size={15} /></button>
        <input inputMode="decimal" aria-label={label} value={value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
        <button type="button" aria-label={`Increase ${lower}`} onClick={() => onChange(String(+(num + step).toFixed(2)))}><Plus size={15} /></button>
      </div>
    </div>
  );
}
function Seg({ items, value, onChange }) {
  const i = Math.max(0, items.findIndex((x) => x.k === value));
  return (
    <div className="seg" aria-label="Choose body metric">
      <div className="segpill" style={{ width: `calc((100% - 8px) / ${items.length})`, transform: `translateX(${i * 100}%)` }} />
      {items.map((x) => (
        <button key={x.k} type="button" aria-pressed={x.k === value} className={"segbtn " + (x.k === value ? "on" : "")} onClick={() => onChange(x.k)}>{x.label}</button>
      ))}
    </div>
  );
}

function Collapse({ open, children }) {
  const ref = useRef(null);
  const [h, setH] = useState("0px");
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (open) {
      setH(el.scrollHeight + "px");
    } else if (h === "none") {
      setH(el.scrollHeight + "px");
      requestAnimationFrame(() => requestAnimationFrame(() => setH("0px")));
    } else {
      setH("0px");
    }
  }, [open]); // eslint-disable-line
  return (
    <div ref={ref} className="collapse2" style={{ maxHeight: h, opacity: open ? 1 : 0 }}
      onTransitionEnd={(e) => { if (e.propertyName === "max-height" && open) setH("none"); }}>
      {children}
    </div>
  );
}

export default function App() {
  const firebase = useFirebaseSync();
  const { user, authLoading, syncStatus, signIn, signOut, firebaseConfigured, mergeLocalToCloud, subscribe, writeToCloud, readStore, readLocal } = firebase;

  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");
  const [plan, setPlan] = useState(DEFAULT_DAYS);
  const [logs, setLogs] = useState([]);
  const [body, setBody] = useState({ weight: [], chest: [], bicep: [], waist: [] });
  const [notes, setNotes] = useState({});
  const [meta, setMeta] = useState({ start: 84, goal: 78 });
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ start: "", goal: "" });
  const [selectedKey, setSelectedKey] = useState(WEEK_MAP[new Date().getDay()]);
  const [draft, setDraft] = useState({});
  const [openEx, setOpenEx] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState("");
  const [timer, setTimer] = useState(null);
  const [lastRest, setLastRest] = useState(90);
  const timerRef = useRef(null);

  // body logging
  const [metric, setMetric] = useState("weight");
  const [bVal, setBVal] = useState("");
  const [bDate, setBDate] = useState(todayISO());
  // strength
  const [lift, setLift] = useState("");
  // history
  const [openSession, setOpenSession] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmWorkout, setConfirmWorkout] = useState(false);

  // AI features
  const [aiTips, setAiTips] = useState({}); // { exerciseName: { text, loading } }
  const [aiInsights, setAiInsights] = useState({ text: "", loading: false, ts: 0 });

  // Load initial data (from cloud if signed in, localStorage otherwise)
  useEffect(() => {
    if (authLoading) return; // wait for auth to resolve
    (async () => {
      // If user just signed in, merge local data to cloud first
      if (user) {
        await mergeLocalToCloud(user.uid);
      }
      setPlan(await readStore("ff_plan", DEFAULT_DAYS));
      setLogs(await readStore("ff_logs", []));
      setNotes(await readStore("ff_notes", {}));
      const fb = await readStore("ff_body", null);
      if (fb) setBody(fb);
      else {
        const old = readLocal("ff_weights", []);
        setBody({ weight: old.map((w) => ({ date: w.date, v: w.weight })), chest: [], bicep: [], waist: [] });
      }
      const fm = await readStore("ff_meta", null);
      if (fm) setMeta(fm);
      setLoaded(true);
    })();
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to real-time cloud updates when signed in
  useEffect(() => {
    if (!loaded || !user) return;
    const unsubs = [
      subscribe("ff_plan", DEFAULT_DAYS, setPlan),
      subscribe("ff_logs", [], setLogs),
      subscribe("ff_body", { weight: [], chest: [], bicep: [], waist: [] }, setBody),
      subscribe("ff_notes", {}, setNotes),
      subscribe("ff_meta", { start: 84, goal: 78 }, setMeta),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [loaded, user, subscribe]);

  // Persist state changes (to cloud if signed in, localStorage otherwise)
  useEffect(() => { if (loaded) writeToCloud("ff_plan", plan); }, [plan, loaded]); // eslint-disable-line
  useEffect(() => { if (loaded) writeToCloud("ff_logs", logs); }, [logs, loaded]); // eslint-disable-line
  useEffect(() => { if (loaded) writeToCloud("ff_body", body); }, [body, loaded]); // eslint-disable-line
  useEffect(() => { if (loaded) writeToCloud("ff_notes", notes); }, [notes, loaded]); // eslint-disable-line
  useEffect(() => { if (loaded) writeToCloud("ff_meta", meta); }, [meta, loaded]); // eslint-disable-line
  useEffect(() => () => clearInterval(timerRef.current), []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1700); };
  const handleSignIn = () => {
    if (!firebaseConfigured) {
      flash("Cloud sync is not configured yet");
      return;
    }
    signIn();
  };

  /* rest timer */
  const startRest = (sec) => {
    setLastRest(sec); clearInterval(timerRef.current);
    setTimer({ remaining: sec, total: sec });
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (!t) return t;
        if (t.remaining <= 1) {
          clearInterval(timerRef.current);
          try { navigator.vibrate && navigator.vibrate([220, 120, 220]); } catch (e) {}
          beep(); flash("Rest done — go 🔥");
          return null;
        }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
  };
  const skipRest = () => { clearInterval(timerRef.current); setTimer(null); };

  const lastForExercise = (name) => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const e = logs[i].exercises?.find((x) => x.n === name);
      if (e && e.sets?.some((s) => s.weight)) return e;
    }
    return null;
  };
  const readyToProgress = (exN, r) => {
    const top = topRep(r); if (top == null) return false;
    const last = lastForExercise(exN); if (!last || !last.sets.length) return false;
    return last.sets.every((s) => { const reps = parseInt(s.reps); return reps && reps >= top; });
  };

  useEffect(() => {
    if (!loaded) return;
    const day = plan.find((d) => d.key === selectedKey); if (!day) return;
    const d = {};
    day.ex.forEach((ex) => {
      const last = lastForExercise(ex.n);
      d[ex.n] = Array.from({ length: ex.s }, (_, i) => ({ weight: last?.sets?.[i]?.weight ?? "", reps: last?.sets?.[i]?.reps ?? "" }));
    });
    setDraft(d); setOpenEx(null);
  }, [selectedKey, loaded, logs, plan]);

  const setVal = (exN, idx, f, v) => setDraft((p) => ({ ...p, [exN]: p[exN].map((s, i) => i === idx ? { ...s, [f]: v } : s) }));

  const completeWorkout = () => {
    const day = plan.find((d) => d.key === selectedKey);
    const exercises = day.ex
      .map((ex) => ({ n: ex.n, sets: (draft[ex.n] || []).filter((s) => s.weight || s.reps).map((s) => ({ weight: s.weight, reps: s.reps })) }))
      .filter((ex) => ex.sets.length > 0);
    if (!exercises.length) { flash("Log at least one set first"); return; }
    setLogs((prev) => [...prev, { id: Date.now(), date: todayISO(), dayKey: day.key, dayName: day.name, exercises }]);
    flash("Workout saved 💪");
  };

  /* plan edit */
  const patchEx = (idx, p) => setPlan((prev) => prev.map((d) => d.key === selectedKey ? { ...d, ex: d.ex.map((e, i) => i === idx ? { ...e, ...p } : e) } : d));
  const delEx = (idx) => setPlan((prev) => prev.map((d) => d.key === selectedKey ? { ...d, ex: d.ex.filter((_, i) => i !== idx) } : d));
  const addEx = () => setPlan((prev) => prev.map((d) => d.key === selectedKey ? { ...d, ex: [...d.ex, { n: "New exercise", s: 3, r: "10–12" }] } : d));
  const moveEx = (idx, dir) => setPlan((prev) => prev.map((d) => {
    if (d.key !== selectedKey) return d;
    const a = [...d.ex]; const j = idx + dir; if (j < 0 || j >= a.length) return d;
    [a[idx], a[j]] = [a[j], a[idx]]; return { ...d, ex: a };
  }));
  const resetPlan = () => { setPlan(DEFAULT_DAYS); flash("Plan reset"); };

  /* body logging */
  const addBody = () => {
    const v = parseFloat(bVal); if (!v || !bDate) { flash("Enter a value & date"); return; }
    setBody((prev) => ({ ...prev, [metric]: [...prev[metric].filter((e) => e.date !== bDate), { date: bDate, v: +v.toFixed(1) }] }));
    setBVal(""); flash("Logged " + METRICS.find((m) => m.k === metric).label.toLowerCase());
  };
  const mSeries = (m) => [...(body[m] || [])].sort((a, b) => a.date.localeCompare(b.date));

  /* stats */
  const workoutDates = useMemo(() => new Set(logs.map((l) => l.date)), [logs]);
  const thisWeek = useMemo(() => { const s = startOfWeek(); return [...workoutDates].filter((d) => new Date(d + "T00:00:00") >= s).length; }, [workoutDates]);
  const streak = useMemo(() => {
    let c = 0; const d = new Date(); d.setHours(0,0,0,0);
    for (;;) { const iso = d.toISOString().slice(0,10); if (workoutDates.has(iso)) { c++; d.setDate(d.getDate()-1);} else break; } return c;
  }, [workoutDates]);
  const prs = useMemo(() => {
    const m = {};
    logs.forEach((l) => l.exercises.forEach((ex) => ex.sets.forEach((s) => {
      const w = parseFloat(s.weight); if (!w) return; if (!m[ex.n] || w > m[ex.n].weight) m[ex.n] = { weight: w, reps: s.reps };
    }))); return m;
  }, [logs]);
  const loggedExercises = useMemo(() => { const s = new Set(); logs.forEach((l) => l.exercises.forEach((e) => e.sets.some((x) => x.weight) && s.add(e.n))); return [...s]; }, [logs]);
  useEffect(() => { if (!lift && loggedExercises.length) setLift(loggedExercises[0]); }, [loggedExercises]);
  const strengthData = useMemo(() => {
    if (!lift) return [];
    const pts = [];
    logs.forEach((l) => { const ex = l.exercises.find((e) => e.n === lift); if (!ex) return; let best = 0;
      ex.sets.forEach((s) => { const w = parseFloat(s.weight), reps = parseInt(s.reps); if (w && reps) { const e = w * (1 + reps / 30); if (e > best) best = e; } });
      if (best > 0) pts.push({ d: dayLabel(l.date), e: Math.round(best) }); });
    return pts;
  }, [lift, logs]);

  const cur = (m) => { const s = mSeries(m); return s.length ? s[s.length - 1].v : (m === "weight" ? meta.start : null); };
  const curWeight = cur("weight");
  const wpct = Math.max(0, Math.min(100, ((meta.start - curWeight) / (meta.start - meta.goal)) * 100));

  const day = plan.find((d) => d.key === selectedKey);
  const exDone = (exN) => (draft[exN] || []).some((s) => s.weight || s.reps);
  const C = 2 * Math.PI * 26;

  const mConf = METRICS.find((m) => m.k === metric);
  const series = mSeries(metric);
  const animCur = useCountUp(cur(metric) ?? 0);
  const chartData = series.map((e) => ({ d: dayLabel(e.date), v: e.v }));
  const first = series[0]?.v, latest = series[series.length - 1]?.v;
  const change = first != null && latest != null ? +(latest - first).toFixed(1) : null;
  const goodDown = metric === "weight" || metric === "waist";

  const animStreak = useCountUp(streak);
  const animWeek = useCountUp(thisWeek);
  const animTotal = useCountUp(workoutDates.size);

  return (
    <div className="root">
      <style>{CSS}</style>
      <div className="grain" />
      <div className="auraA" /><div className="auraB" />

      <div className="shell">
        <header className="head">
          <div>
            <div className="wordmark">FORGE</div>
            <div className="subhead">
              {tab === "today" ? "Today's session" : tab === "body" ? "Body composition" : tab === "progress" ? "Your progress" : "Workout history"}
            </div>
          </div>
          <div className="headright">
            {user && (
              <div className={"syncbadge " + syncStatus} aria-live="polite">
                {syncStatus === "synced" ? <Cloud size={13} /> : syncStatus === "syncing" ? <Loader size={13} className="spinning" /> : syncStatus === "offline" ? <CloudOff size={13} /> : null}
                <span>{syncStatus === "synced" ? "Synced" : syncStatus === "syncing" ? "Syncing" : "Offline"}</span>
              </div>
            )}
            {user ? (
              <button type="button" className="authbtn" onClick={signOut} title="Sign out" aria-label="Sign out of cloud sync">
                {user.photoURL ? <img src={user.photoURL} alt="" className="avatar" referrerPolicy="no-referrer" /> : <LogOut size={16} />}
              </button>
            ) : (
              <button type="button" className="authbtn signin" onClick={handleSignIn} title={firebaseConfigured ? "Sign in with Google" : "Cloud sync is not configured"} aria-label={firebaseConfigured ? "Sign in with Google to sync" : "Cloud sync is not configured"}>
                <LogIn size={15} /><span>{firebaseConfigured ? "Sync" : "Local"}</span>
              </button>
            )}
          </div>
        </header>

        {/* ---------- TODAY ---------- */}
        {tab === "today" && (
          <div className="page" key="today">
            <div className="dayrow" aria-label="Choose workout day">
              {plan.map((d) => (
                <button key={d.key} type="button" aria-pressed={selectedKey === d.key} onClick={() => { setSelectedKey(d.key); setEditMode(false); }}
                  className={"daypill " + (selectedKey === d.key ? "active" : "")}>{d.name}</button>
              ))}
            </div>

            {day.key === "rest" ? (
              <div className="card rest">
                <div className="restEmoji">🌙</div><h3>Rest day</h3>
                <p>Recovery is when muscle is built. Walk 8–10k steps, stretch, run the lower-back circuit, hit your protein.</p>
              </div>
            ) : (
              <>
                <div className="dayhead card">
                  <div><h2>{day.name}</h2><span>{day.sub}</span></div>
                  <button type="button" className={"editbtn " + (editMode ? "on" : "")} aria-pressed={editMode} onClick={() => { setEditMode(!editMode); setOpenEx(null); }}>
                    {editMode ? <Check size={15} /> : <Edit3 size={15} />}{editMode ? "Done" : "Edit"}
                  </button>
                </div>

                {editMode ? (
                  <>
                    {day.ex.map((ex, idx) => (
                      <div key={idx} className="card editrow">
                        <input className="editname" aria-label={`Exercise ${idx + 1} name`} value={ex.n} onChange={(e) => patchEx(idx, { n: e.target.value })} />
                        <div className="editline">
                          <div className="editsmall"><span>sets</span>
                            <div className="ministep">
                              <button type="button" aria-label={`Decrease sets for ${ex.n}`} onClick={() => patchEx(idx, { s: Math.max(1, ex.s - 1) })}><Minus size={13} /></button>
                              <b>{ex.s}</b><button type="button" aria-label={`Increase sets for ${ex.n}`} onClick={() => patchEx(idx, { s: ex.s + 1 })}><Plus size={13} /></button>
                            </div>
                          </div>
                          <div className="editsmall"><span>reps</span>
                            <input className="editreps" aria-label={`Rep range for ${ex.n}`} value={ex.r} onChange={(e) => patchEx(idx, { r: e.target.value })} />
                          </div>
                          <div className="editactions">
                            <button type="button" aria-label={`Move ${ex.n} up`} onClick={() => moveEx(idx, -1)}><ChevronUp size={16} /></button>
                            <button type="button" aria-label={`Move ${ex.n} down`} onClick={() => moveEx(idx, 1)}><ChevronDown size={16} /></button>
                            <button type="button" className="del" aria-label={`Delete ${ex.n}`} onClick={() => delEx(idx)}><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="addex" onClick={addEx}><Plus size={17} /> Add exercise</button>
                    <button type="button" className="resetplan" onClick={resetPlan}><RotateCcw size={13} /> Reset full weekly plan to default</button>
                  </>
                ) : (
                  <>
                    {day.ex.map((ex) => {
                      const last = lastForExercise(ex.n);
                      const open = openEx === ex.n;
                      const hasNote = (notes[ex.n] || "").trim().length > 0;
                      const ready = readyToProgress(ex.n, ex.r);
                      return (
                        <div key={ex.n} className={"card exc " + (open ? "open" : "")}>
                          <button type="button" className="exhead" aria-expanded={open} onClick={() => setOpenEx(open ? null : ex.n)}>
                            <div className="exleft">
                              <span className={"exstate " + (exDone(ex.n) ? "on" : "")} aria-hidden="true">{exDone(ex.n) ? <Check size={12} /> : ""}</span>
                              <div>
                                <div className="exname">{ex.n}{hasNote && <MessageSquare size={11} className="noteflag" />}</div>
                                <div className="exmeta">
                                  {ex.s} × {ex.r}
                                  {last && <span className="lastpill">last {last.sets.find((s) => s.weight)?.weight} × {last.sets.find((s) => s.reps)?.reps}</span>}
                                  {ready && <span className="nudge"><Zap size={10} /> add weight</span>}
                                </div>
                              </div>
                            </div>
                            <ChevronDown size={17} className={"chev " + (open ? "open" : "")} />
                          </button>
                          <Collapse open={open}>
                            <div className="sets">
                              {(draft[ex.n] || []).map((s, i) => (
                                <div className="setrow" key={i}>
                                  <span className="setno">{i + 1}</span>
                                  <NumField label="kg" step={2.5} value={s.weight} onChange={(v) => setVal(ex.n, i, "weight", v)} />
                                  <NumField label="reps" step={1} value={s.reps} onChange={(v) => setVal(ex.n, i, "reps", v)} />
                                  <button type="button" className="restbtn" aria-label={`Start ${mmss(lastRest)} rest timer`} onClick={() => startRest(lastRest)}><Clock size={16} /></button>
                                </div>
                              ))}
                              {/* AI Exercise Tip */}
                              <button
                                type="button"
                                className={"aitipbtn " + (aiTips[ex.n]?.loading ? "loading" : "")}
                                disabled={aiTips[ex.n]?.loading}
                                onClick={async () => {
                                  if (aiTips[ex.n]?.text) { setAiTips((p) => ({ ...p, [ex.n]: undefined })); return; }
                                  if (!hasApiKey()) { flash("Set your OpenAI key first (tap ✨ button)"); return; }
                                  setAiTips((p) => ({ ...p, [ex.n]: { text: "", loading: true } }));
                                  try {
                                    const lastEx = lastForExercise(ex.n);
                                    const history = lastEx ? lastEx.sets.map((s) => `${s.weight}kg×${s.reps}`).join(", ") : "no history yet";
                                    const ctx = buildContext(plan, logs, body, notes, { exerciseName: ex.n, exerciseHistory: history });
                                    const tip = await chatComplete([{ role: "user", content: `Give me tips for: ${ex.n}` }], SYSTEM_PROMPTS.exerciseTip(ctx));
                                    setAiTips((p) => ({ ...p, [ex.n]: { text: tip, loading: false } }));
                                  } catch (err) {
                                    setAiTips((p) => ({ ...p, [ex.n]: { text: `⚠️ ${err.message}`, loading: false } }));
                                  }
                                }}
                              >
                                <Sparkles size={13} />
                                {aiTips[ex.n]?.text ? "Hide tip" : aiTips[ex.n]?.loading ? "Thinking…" : "AI tip"}
                              </button>
                              {aiTips[ex.n]?.text && (
                                <div className="aitipbox">
                                  {aiTips[ex.n].text}
                                </div>
                              )}
                              <div className="noterow">
                                <MessageSquare size={13} />
                                <textarea className="exnote" aria-label={`Notes for ${ex.n}`} placeholder="Form cues, how it felt…" value={notes[ex.n] || ""} onChange={(e) => setNotes((p) => ({ ...p, [ex.n]: e.target.value }))} />
                              </div>
                            </div>
                          </Collapse>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className={"cta " + (confirmWorkout ? "confirm" : "")}
                      onClick={() => {
                        if (confirmWorkout) { completeWorkout(); setConfirmWorkout(false); }
                        else { setConfirmWorkout(true); setTimeout(() => setConfirmWorkout(false), 2500); }
                      }}
                    >
                      <Check size={18} /> {confirmWorkout ? "Tap again to save" : "Complete workout"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------- BODY ---------- */}
        {tab === "body" && (
          <div className="page" key="body">
            <Seg items={METRICS} value={metric} onChange={(k) => { setMetric(k); setBVal(""); }} />

            <div className="card bigcard">
              <div className="bwtop">
                <div>
                  <div className="bwnum">{cur(metric) != null ? animCur.toFixed(1) : "—"}<small>{mConf.unit}</small></div>
                  <div className="bwsub">current {mConf.label.toLowerCase()}</div>
                </div>
                {mConf.goal
                  ? editGoal ? (
                    <div className="goaleditrow">
                      <div className="goaleditfield"><span>Start</span><input type="number" inputMode="decimal" value={goalDraft.start} onChange={(e) => setGoalDraft(p => ({ ...p, start: e.target.value }))} placeholder={String(meta.start)} /></div>
                      <div className="goaleditfield"><span>Goal</span><input type="number" inputMode="decimal" value={goalDraft.goal} onChange={(e) => setGoalDraft(p => ({ ...p, goal: e.target.value }))} placeholder={String(meta.goal)} /></div>
                      <button type="button" className="goaleditok" onClick={() => { const s = +goalDraft.start, g = +goalDraft.goal; if (s && g) setMeta({ start: s, goal: g }); setEditGoal(false); }}><Check size={14} /></button>
                    </div>
                  ) : (
                    <button type="button" className="tagline goaledittag" onClick={() => { setGoalDraft({ start: String(meta.start), goal: String(meta.goal) }); setEditGoal(true); }}>
                      <Target size={13} /> goal {meta.goal}kg <Edit3 size={11} />
                    </button>
                  )
                  : change != null && <div className={"tagline " + ((change < 0) === goodDown ? "good" : "")}>{change < 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{Math.abs(change)}{mConf.unit} since start</div>}
              </div>
              {mConf.goal && (
                <>
                  <div className="bar"><div className="barfill" style={{ width: wpct + "%" }} /></div>
                  <div className="bwstats">
                    <div><b>{(meta.start - curWeight) > 0 ? "−" + (meta.start - curWeight).toFixed(1) : "0"}</b><span>lost (kg)</span></div>
                    <div><b>{Math.round(wpct)}%</b><span>to goal</span></div>
                    <div><b>{(curWeight - meta.goal) > 0 ? (curWeight - meta.goal).toFixed(1) : "0"}</b><span>to go (kg)</span></div>
                  </div>
                </>
              )}
            </div>

            <div className="card logger">
              <div className="loggerhead">Log {mConf.label.toLowerCase()}</div>
              <div className="loggerrow">
                <div className="fieldcol"><span className="numlabel">Date</span>
                  <input type="date" className="dateinput" aria-label="Reading date" value={bDate} max={todayISO()} onChange={(e) => setBDate(e.target.value)} />
                </div>
                <div className="fieldcol"><span className="numlabel">{mConf.unit}</span>
                  <input inputMode="decimal" className="valinput" aria-label={`${mConf.label} value in ${mConf.unit}`} placeholder="0" value={bVal} onChange={(e) => setBVal(e.target.value)} />
                </div>
                <button type="button" className="addbtn" onClick={addBody}>Save</button>
              </div>
              <div className="hint">Tip: change the date to backfill your old readings.</div>
            </div>

            {chartData.length > 0 ? (
              <div className="card chartcard">
                <div className="cardlabel"><TrendingUp size={15} /> {mConf.label} trend</div>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a87a4e" stopOpacity={0.35} /><stop offset="100%" stopColor="#a87a4e" stopOpacity={0} />
                      </linearGradient></defs>
                      <XAxis dataKey="d" tick={{ fill: "#7a6c5a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: "#7a6c5a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#fffaf2", border: "1px solid #e4d9c8", borderRadius: 12, color: "#221d17" }} />
                      {mConf.goal && <ReferenceLine y={meta.goal} stroke="#a87a4e" strokeDasharray="5 5" />}
                      <Area type="monotone" dataKey="v" stroke="#a87a4e" strokeWidth={2.5} fill="url(#g)" dot={{ r: 3, fill: "#a87a4e" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="card empty">No {mConf.label.toLowerCase()} data yet. Add your past readings above with their dates to build the trend.</div>
            )}
          </div>
        )}

        {/* ---------- PROGRESS ---------- */}
        {tab === "progress" && (
          <div className="page" key="progress">
            {/* AI Insights Card */}
            <div className="card chartcard aiinsights-card">
              <div className="cardlabel">
                <Brain size={15} /> AI Insights
                <button type="button" className="airefresh" aria-label="Refresh AI insights" onClick={async () => {
                  if (!hasApiKey()) { flash("Set your OpenAI key first (tap ✨ button)"); return; }
                  setAiInsights({ text: "", loading: true, ts: 0 });
                  try {
                    const ctx = buildContext(plan, logs, body, notes);
                    const result = await chatComplete([{ role: "user", content: "Give me my weekly workout analysis and insights." }], SYSTEM_PROMPTS.insights(ctx));
                    setAiInsights({ text: result, loading: false, ts: Date.now() });
                  } catch (err) {
                    setAiInsights({ text: `⚠️ ${err.message}`, loading: false, ts: 0 });
                  }
                }}><RefreshCw size={13} className={aiInsights.loading ? "spinning" : ""} /></button>
              </div>
              {aiInsights.loading ? (
                <div className="prempty" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader size={14} className="spinning" /> Analyzing your workouts…
                </div>
              ) : aiInsights.text ? (
                <div className="aiinsights-text">{aiInsights.text}</div>
              ) : (
                <div className="prempty">
                  <button type="button" className="aiinsights-gen" onClick={async () => {
                    if (!hasApiKey()) { flash("Set your OpenAI key first (tap ✨ button)"); return; }
                    setAiInsights({ text: "", loading: true, ts: 0 });
                    try {
                      const ctx = buildContext(plan, logs, body, notes);
                      const result = await chatComplete([{ role: "user", content: "Give me my weekly workout analysis and insights." }], SYSTEM_PROMPTS.insights(ctx));
                      setAiInsights({ text: result, loading: false, ts: Date.now() });
                    } catch (err) {
                      setAiInsights({ text: `⚠️ ${err.message}`, loading: false, ts: 0 });
                    }
                  }}>
                    <Sparkles size={14} /> Generate AI Insights
                  </button>
                </div>
              )}
            </div>

            <div className="statgrid">
              <div className="card stat"><Flame size={19} /><b>{Math.round(animStreak)}</b><span>day streak</span></div>
              <div className="card stat"><Calendar size={19} /><b>{Math.round(animWeek)}<small>/6</small></b><span>this week</span></div>
              <div className="card stat"><Dumbbell size={19} /><b>{Math.round(animTotal)}</b><span>total days</span></div>
            </div>

            <div className="card chartcard">
              <div className="cardlabel"><TrendingUp size={15} /> Strength trend (est. 1RM)</div>
              {loggedExercises.length === 0 ? (
                <div className="prempty">Log a few workouts and your strength curve appears here.</div>
              ) : (
                <>
                  <div className="liftselwrap">
                    <select className="liftsel" aria-label="Choose lift for strength trend" value={lift} onChange={(e) => setLift(e.target.value)}>
                      {loggedExercises.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown size={14} className="liftselarrow" />
                  </div>
                  {strengthData.length > 0 ? (
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={strengthData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                          <XAxis dataKey="d" tick={{ fill: "#7a6c5a", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis domain={["auto", "auto"]} tick={{ fill: "#7a6c5a", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "#fffaf2", border: "1px solid #e4d9c8", borderRadius: 12, color: "#221d17" }} formatter={(v) => [v + " kg", "est 1RM"]} />
                          <Line type="monotone" dataKey="e" stroke="#221d17" strokeWidth={2.5} dot={{ r: 3, fill: "#221d17" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="prempty">Need a logged set with weight & reps for this lift.</div>}
                </>
              )}
            </div>

            <div className="card chartcard">
              <div className="cardlabel"><Calendar size={15} /> Last 6 weeks</div>
              <Heatmap dates={workoutDates} />
            </div>

            <div className="card chartcard">
              <div className="cardlabel"><Award size={15} /> Personal bests</div>
              {Object.keys(prs).length === 0 ? (
                <div className="prempty">Your top weights will show up here once you start logging.</div>
              ) : (
                <div className="prlist">
                  {Object.entries(prs).sort((a, b) => b[1].weight - a[1].weight).slice(0, 12).map(([n, p]) => (
                    <div className="prrow" key={n}><span>{n}</span><b>{p.weight}kg × {p.reps}</b></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- HISTORY ---------- */}
        {tab === "history" && (
          <div className="page" key="history">
            {logs.length === 0 ? (
              <div className="card empty">No workouts logged yet. Finish a session on the Today tab and it'll appear here.</div>
            ) : (
              [...logs].reverse().map((l) => {
                const open = openSession === l.id;
                const totalSets = l.exercises.reduce((a, e) => a + e.sets.length, 0);
                return (
                  <div key={l.id} className={"card hist " + (open ? "open" : "")}>
                    <button type="button" className="histhead" aria-expanded={open} onClick={() => setOpenSession(open ? null : l.id)}>
                      <div>
                        <div className="histday">{l.dayName}</div>
                        <div className="histmeta">{longDate(l.date)} · {l.exercises.length} exercises · {totalSets} sets</div>
                      </div>
                      <ChevronDown size={17} className={"chev " + (open ? "open" : "")} />
                    </button>
                    <Collapse open={open}>
                      <div className="histbody">
                        {l.exercises.map((e, i) => (
                          <div className="histex" key={i}>
                            <div className="histexn">{e.n}</div>
                            <div className="histsets">{e.sets.map((s, j) => <span key={j}>{s.weight || "—"}×{s.reps || "—"}</span>)}</div>
                          </div>
                        ))}
                        <button type="button" className={"histdel " + (confirmDel === l.id ? "confirm" : "")}
                          onClick={() => { if (confirmDel === l.id) { setLogs((p) => p.filter((x) => x.id !== l.id)); setConfirmDel(null); flash("Session deleted"); } else { setConfirmDel(l.id); setTimeout(() => setConfirmDel((c) => c === l.id ? null : c), 2500); } }}>
                          <Trash2 size={14} /> {confirmDel === l.id ? "Tap again to delete" : "Delete session"}
                        </button>
                      </div>
                    </Collapse>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* rest timer */}
      {timer && (
        <div className="resttimer card">
          <div className="rtring">
            <svg width="64" height="64">
              <circle cx="32" cy="32" r="26" stroke="rgba(34,29,23,.12)" strokeWidth="5" fill="none" />
              <circle cx="32" cy="32" r="26" stroke="#a87a4e" strokeWidth="5" fill="none" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - timer.remaining / timer.total)} transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <span className="rttime">{mmss(timer.remaining)}</span>
          </div>
          <div className="rtright">
            <div className="rtchips">{REST_PRESETS.map((p) => <button key={p} type="button" className="rtchip" aria-label={`Set rest timer to ${mmss(p)}`} onClick={() => startRest(p)}>{p < 120 ? p + "s" : mmss(p)}</button>)}</div>
            <div className="rtactions">
              <button type="button" className="rtbtn" onClick={() => setTimer((t) => t ? { ...t, remaining: t.remaining + 15, total: Math.max(t.total, t.remaining + 15) } : t)}>+15s</button>
              <button type="button" className="rtbtn skip" onClick={skipRest}><SkipForward size={14} /> Skip</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <Suspense fallback={null}>
        <AiCoach plan={plan} logs={logs} body={body} notes={notes} />
      </Suspense>

      <nav className="tabbar" aria-label="Primary">
        {[["today", Dumbbell, "Today"], ["body", Ruler, "Body"], ["progress", BarChart3, "Progress"], ["history", History, "History"]].map(([k, Icon, label]) => (
          <button key={k} type="button" className={"tab " + (tab === k ? "on" : "")} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}><Icon size={21} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  );
}

function Heatmap({ dates }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const start = new Date(today);
  start.setDate(today.getDate() - dayOfWeek - 35); // Monday 6 weeks ago
  const cells = [];
  const d = new Date(start);
  for (let i = 0; i < 42; i++) {
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, on: dates.has(iso), isToday: d.getTime() === today.getTime(), future: d > today });
    d.setDate(d.getDate() + 1);
  }
  return (
    <div>
      <div className="heat-header">
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <span key={i} className="heat-daylabel">{l}</span>
        ))}
      </div>
      <div className="heat">
        {cells.map((c) => (
          <div key={c.iso} title={c.iso}
            className={"cell " + (c.on ? "on " : "") + (c.isToday ? "today " : "") + (c.future ? "future" : "")} />
        ))}
      </div>
    </div>
  );
}

const CSS = `
@keyframes rise { from { opacity:0; transform: translateY(10px);} to { opacity:1; transform:none; } }
@keyframes pop { from { opacity:0; transform: translate(-50%, 10px) scale(.96);} to { opacity:1; transform: translate(-50%,0) scale(1);} }
@keyframes aura { from { transform: translate(0,0) scale(1);} to { transform: translate(24px,30px) scale(1.15);} }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.root {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
  min-height: 100vh; color: #221d17; position: relative; overflow-x: hidden;
  background: radial-gradient(120% 80% at 50% -10%, #f3ecdf 0%, #ece3d5 45%, #e6dccb 100%);
  letter-spacing: -0.012em;
}
.grain { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .045; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.auraA, .auraB { position: fixed; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; animation: aura 20s ease-in-out infinite alternate; }
.auraA { width: 360px; height: 360px; background: #d8b88e; opacity: .25; top: -120px; right: -80px; }
.auraB { width: 320px; height: 320px; background: #c9a079; opacity: .18; bottom: -120px; left: -60px; animation-delay: -8s; }
@media (prefers-reduced-motion: reduce) { .auraA,.auraB { animation: none; } .page > * { animation: none !important; } }

.shell { position: relative; z-index: 1; max-width: 460px; margin: 0 auto; padding: 24px 16px 128px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.wordmark { font-size: 25px; font-weight: 800; letter-spacing: 5px; color: #221d17; }
.subhead { font-size: 13px; color: #8a7b67; margin-top: 3px; font-weight: 500; }
.datechip { padding: 8px 14px; border-radius: 13px; font-size: 12.5px; font-weight: 600; color: #6f6151; background: rgba(255,253,248,.6); border: 1px solid rgba(34,29,23,.07); }

.card {
  background: rgba(255,253,249,.72); backdrop-filter: blur(20px) saturate(115%); -webkit-backdrop-filter: blur(20px) saturate(115%);
  border: 1px solid rgba(255,255,255,.7); border-radius: 22px;
  box-shadow: 0 10px 30px rgba(95,68,32,.08), inset 0 1px 0 rgba(255,255,255,.8);
}
.page { display: flex; flex-direction: column; gap: 12px; }
.page > * { animation: rise .5s cubic-bezier(.22,1,.36,1) both; }
.page > *:nth-child(1){animation-delay:.03s} .page > *:nth-child(2){animation-delay:.07s}
.page > *:nth-child(3){animation-delay:.11s} .page > *:nth-child(4){animation-delay:.15s}
.page > *:nth-child(5){animation-delay:.19s} .page > *:nth-child(6){animation-delay:.23s}
.page > *:nth-child(7){animation-delay:.27s} .page > *:nth-child(8){animation-delay:.31s}
.page > *:nth-child(9){animation-delay:.34s} .page > *:nth-child(n+10){animation-delay:.37s}

.dayrow { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; margin: 0 -2px; scrollbar-width: none; }
.dayrow::-webkit-scrollbar { display: none; }
.daypill { padding: 9px 15px; border-radius: 14px; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer;
  color: #7a6c5a; background: rgba(255,253,249,.6); border: 1px solid rgba(34,29,23,.08); transition: transform .25s cubic-bezier(.34,1.4,.64,1), background .2s, color .2s; }
.daypill:active { transform: scale(.95); }
.daypill.active { background: #221d17; color: #f3ecdf; border-color: #221d17; }

.dayhead { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; }
.dayhead h2 { margin: 0; font-size: 22px; font-weight: 800; }
.dayhead span { font-size: 13px; color: #8a7b67; }
.editbtn { display: flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 12px; border: 1px solid rgba(34,29,23,.12); background: rgba(255,253,249,.5); color: #221d17; font-size: 13px; font-weight: 600; cursor: pointer; transition: transform .2s; }
.editbtn:active { transform: scale(.95); }
.editbtn.on { background: #a87a4e; color: #fff; border-color: #a87a4e; }

.exc { overflow: hidden; transition: box-shadow .3s; }
.exc.open { box-shadow: 0 14px 38px rgba(95,68,32,.13), inset 0 1px 0 rgba(255,255,255,.8); }
.exhead { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 15px 16px; background: none; border: none; color: #221d17; cursor: pointer; text-align: left; }
.exleft { display: flex; align-items: center; gap: 12px; }
.exstate { width: 21px; height: 21px; border-radius: 50%; border: 1.5px solid rgba(34,29,23,.22); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: .25s cubic-bezier(.34,1.4,.64,1); }
.exstate.on { background: #a87a4e; border-color: #a87a4e; color: #fff; transform: scale(1.05); }
.exname { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.noteflag { color: #a87a4e; }
.exmeta { font-size: 12px; color: #8a7b67; margin-top: 3px; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.lastpill { background: rgba(34,29,23,.06); padding: 2px 8px; border-radius: 7px; font-weight: 600; color: #6f6151; }
.nudge { display: inline-flex; align-items: center; gap: 3px; background: #a87a4e; color: #fff; padding: 2px 8px; border-radius: 7px; font-weight: 700; font-size: 10.5px; letter-spacing: .2px; }
.chev { transition: transform .35s cubic-bezier(.22,1,.36,1); opacity: .45; }
.chev.open { transform: rotate(180deg); }
.collapse2 { overflow: hidden; transition: max-height .36s cubic-bezier(.22,1,.36,1), opacity .28s ease; }
.sets { padding: 2px 16px 16px; display: flex; flex-direction: column; gap: 9px; }
.setrow { display: flex; align-items: flex-end; gap: 8px; }
.setno { width: 16px; font-size: 12px; font-weight: 700; color: #b0a288; text-align: center; padding-bottom: 9px; }
.numwrap { flex: 1; }
.numlabel { font-size: 10px; color: #9a8c78; text-transform: uppercase; letter-spacing: .6px; margin-left: 3px; font-weight: 600; }
.numfield { display: flex; align-items: center; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.10); border-radius: 12px; margin-top: 3px; }
.numfield button { width: 31px; height: 38px; background: none; border: none; color: #6f6151; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .15s; }
.numfield button:active { background: rgba(34,29,23,.07); }
.numfield input { flex: 1; width: 100%; background: none; border: none; color: #221d17; text-align: center; font-size: 16px; font-weight: 600; outline: none; min-width: 0; }
.restbtn { width: 42px; height: 41px; border-radius: 12px; border: 1px solid rgba(168,122,78,.35); background: rgba(168,122,78,.12); color: #a87a4e; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform .2s; }
.restbtn:active { transform: scale(.9); }
.noterow { display: flex; gap: 8px; align-items: flex-start; margin-top: 2px; color: #b0a288; }
.exnote { flex: 1; background: rgba(34,29,23,.035); border: 1px solid rgba(34,29,23,.10); border-radius: 11px; color: #221d17; font-size: 13px; font-family: inherit; padding: 9px 11px; resize: vertical; min-height: 36px; outline: none; }
.exnote::placeholder { color: #b0a288; }
.cta { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 16px; border-radius: 17px; border: none; color: #f3ecdf; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 4px; background: #221d17; box-shadow: 0 12px 28px rgba(34,29,23,.25); transition: transform .2s; }
.cta:active { transform: scale(.98); }

.editrow { padding: 13px 14px; }
.editname { width: 100%; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.12); border-radius: 11px; color: #221d17; font-size: 15px; font-weight: 600; padding: 9px 11px; outline: none; font-family: inherit; }
.editline { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; }
.editsmall { display: flex; flex-direction: column; gap: 4px; }
.editsmall span { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #9a8c78; margin-left: 2px; font-weight: 600; }
.ministep { display: flex; align-items: center; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.10); border-radius: 11px; }
.ministep button { width: 30px; height: 34px; background: none; border: none; color: #221d17; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ministep b { width: 24px; text-align: center; font-size: 14px; }
.editreps { width: 74px; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.10); border-radius: 11px; color: #221d17; font-size: 14px; padding: 8px 10px; outline: none; font-family: inherit; }
.editactions { margin-left: auto; display: flex; gap: 4px; }
.editactions button { width: 33px; height: 33px; border-radius: 10px; border: 1px solid rgba(34,29,23,.10); background: rgba(34,29,23,.04); color: #6f6151; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.editactions .del { color: #b4452f; border-color: rgba(180,69,47,.25); background: rgba(180,69,47,.08); }
.addex { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 14px; border-radius: 16px; border: 1.5px dashed rgba(34,29,23,.2); background: none; color: #6f6151; font-size: 14px; font-weight: 600; cursor: pointer; }
.resetplan { display: flex; align-items: center; justify-content: center; gap: 6px; background: none; border: none; color: #9a8c78; font-size: 12px; cursor: pointer; padding: 4px; }

.rest { padding: 38px 24px; text-align: center; }
.restEmoji { font-size: 38px; }
.rest h3 { margin: 12px 0 6px; font-size: 19px; }
.rest p { margin: 0; color: #8a7b67; font-size: 14px; line-height: 1.55; }

.seg { position: relative; display: flex; background: rgba(34,29,23,.06); border-radius: 14px; padding: 4px; }
.segpill { position: absolute; top: 4px; left: 4px; height: calc(100% - 8px); background: #fffdf9; border-radius: 11px; box-shadow: 0 3px 10px rgba(95,68,32,.12); transition: transform .4s cubic-bezier(.34,1.3,.5,1); }
.segbtn { position: relative; z-index: 1; flex: 1; padding: 10px 0; background: none; border: none; font-size: 13px; font-weight: 600; color: #8a7b67; cursor: pointer; transition: color .25s; font-family: inherit; }
.segbtn.on { color: #221d17; }

.bigcard { padding: 20px; }
.bwtop { display: flex; justify-content: space-between; align-items: flex-start; }
.bwnum { font-size: 46px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.bwnum small { font-size: 17px; font-weight: 600; color: #9a8c78; margin-left: 4px; }
.bwsub { font-size: 13px; color: #8a7b67; margin-top: 5px; }
.tagline { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: #8a7b67; background: rgba(34,29,23,.05); padding: 6px 11px; border-radius: 11px; }
.tagline.good { color: #fff; background: #a87a4e; }
.bar { height: 9px; background: rgba(34,29,23,.08); border-radius: 20px; overflow: hidden; margin: 18px 0 14px; }
.barfill { height: 100%; background: linear-gradient(90deg, #c9a079, #a87a4e); border-radius: 20px; transition: width .7s cubic-bezier(.22,1,.36,1); }
.bwstats { display: flex; justify-content: space-between; text-align: center; }
.bwstats b { display: block; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.bwstats span { font-size: 10.5px; color: #8a7b67; }

.logger { padding: 16px; }
.loggerhead { font-size: 13px; font-weight: 600; color: #6f6151; margin-bottom: 10px; }
.loggerrow { display: flex; align-items: flex-end; gap: 9px; }
.fieldcol { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.dateinput, .valinput { background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.10); border-radius: 12px; color: #221d17; font-size: 14px; padding: 10px 11px; outline: none; font-family: inherit; width: 100%; }
.valinput { text-align: center; font-weight: 600; font-size: 16px; }
.addbtn { padding: 11px 18px; height: 42px; border-radius: 12px; border: none; background: #221d17; color: #f3ecdf; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; transition: transform .2s; }
.addbtn:active { transform: scale(.96); }
.hint { font-size: 11.5px; color: #9a8c78; margin-top: 9px; }

.chartcard { padding: 16px; }
.cardlabel { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: #6f6151; margin-bottom: 12px; }
.empty, .prempty { color: #8a7b67; font-size: 13px; line-height: 1.55; }
.empty { padding: 22px; text-align: center; }
.prempty { padding: 6px 2px; }
.liftsel { width: 100%; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.10); border-radius: 12px; color: #221d17; font-size: 14px; font-weight: 600; padding: 10px 12px; outline: none; font-family: inherit; margin-bottom: 12px; appearance: none; }

.statgrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.stat { padding: 17px 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #a87a4e; }
.stat b { font-size: 25px; font-weight: 800; color: #221d17; font-variant-numeric: tabular-nums; }
.stat b small { font-size: 13px; color: #9a8c78; font-weight: 600; }
.stat span { font-size: 10.5px; color: #8a7b67; }

.heat { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cell { aspect-ratio: 1; border-radius: 6px; background: rgba(34,29,23,.06); transition: .2s; }
.cell.on { background: #a87a4e; box-shadow: 0 2px 8px rgba(168,122,78,.4); }
.cell.today { outline: 1.5px solid #221d17; outline-offset: 1px; }

.prlist { display: flex; flex-direction: column; }
.prrow { display: flex; justify-content: space-between; align-items: center; padding: 9px 2px; border-bottom: 1px solid rgba(34,29,23,.07); font-size: 14px; }
.prrow:last-child { border-bottom: none; }
.prrow span { color: #4a4238; }
.prrow b { font-weight: 700; color: #a87a4e; }

.hist { overflow: hidden; }
.histhead { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 15px 16px; background: none; border: none; cursor: pointer; text-align: left; color: #221d17; }
.histday { font-size: 15px; font-weight: 700; }
.histmeta { font-size: 12px; color: #8a7b67; margin-top: 3px; }
.histbody { padding: 0 16px 14px; }
.histex { padding: 9px 0; border-top: 1px solid rgba(34,29,23,.07); }
.histexn { font-size: 13.5px; font-weight: 600; }
.histsets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.histsets span { font-size: 11.5px; font-weight: 600; color: #6f6151; background: rgba(34,29,23,.05); padding: 2px 8px; border-radius: 7px; }
.histdel { display: flex; align-items: center; gap: 6px; margin-top: 12px; background: none; border: none; color: #b09a86; font-size: 12.5px; cursor: pointer; padding: 4px; transition: color .2s; }
.histdel.confirm { color: #b4452f; font-weight: 700; }

.resttimer { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 428px; z-index: 18; border-radius: 20px; padding: 12px 14px; display: flex; align-items: center; gap: 14px; animation: pop .35s cubic-bezier(.34,1.3,.5,1); }
.rtring { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
.rttime { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.rtright { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.rtchips { display: flex; gap: 6px; }
.rtchip { flex: 1; padding: 7px 0; border-radius: 10px; border: 1px solid rgba(34,29,23,.12); background: rgba(34,29,23,.04); color: #6f6151; font-size: 12px; font-weight: 600; cursor: pointer; }
.rtactions { display: flex; gap: 6px; }
.rtbtn { flex: 1; padding: 8px 0; border-radius: 10px; border: none; background: rgba(34,29,23,.08); color: #221d17; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; }
.rtbtn.skip { background: #221d17; color: #f3ecdf; }

.toast { position: fixed; bottom: 168px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 15px; font-size: 14px; font-weight: 600; z-index: 20; background: #221d17; color: #f3ecdf; box-shadow: 0 10px 30px rgba(34,29,23,.3); animation: pop .3s ease; }

.tabbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 15; display: flex; justify-content: space-around; padding: 9px 0 calc(9px + env(safe-area-inset-bottom)); background: rgba(243,236,223,.8); backdrop-filter: blur(28px) saturate(140%); -webkit-backdrop-filter: blur(28px) saturate(140%); border-top: 1px solid rgba(34,29,23,.08); }
.tab { display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: #b0a288; font-size: 10.5px; font-weight: 600; cursor: pointer; padding: 4px 16px; transition: color .2s, transform .2s; }
.tab:active { transform: scale(.92); }
.tab.on { color: #221d17; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1.2s linear infinite; }
.headright { display: flex; align-items: center; gap: 8px; }
.syncbadge { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; color: #9a8c78; background: rgba(34,29,23,.04); border: 1px solid rgba(34,29,23,.06); }
.syncbadge.synced { color: #5a8a5e; background: rgba(90,138,94,.08); border-color: rgba(90,138,94,.15); }
.syncbadge.syncing { color: #a87a4e; background: rgba(168,122,78,.08); border-color: rgba(168,122,78,.15); }
.syncbadge.offline { color: #b4452f; background: rgba(180,69,47,.08); border-color: rgba(180,69,47,.15); }
.authbtn { display: flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 12px; border: 1px solid rgba(34,29,23,.12); background: rgba(255,253,249,.6); color: #221d17; font-size: 12px; font-weight: 600; cursor: pointer; transition: transform .2s, background .2s; }
.authbtn:active { transform: scale(.95); }
.authbtn.signin { background: #221d17; color: #f3ecdf; border-color: #221d17; }
.avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }

/* ─── AI Exercise Tips ─── */
.aitipbtn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 11px; border: 1px solid rgba(168,122,78,.25); background: linear-gradient(135deg, rgba(168,122,78,.08), rgba(168,122,78,.15)); color: #a87a4e; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .2s; font-family: inherit; }
.aitipbtn:hover { background: linear-gradient(135deg, rgba(168,122,78,.15), rgba(168,122,78,.22)); }
.aitipbtn:active { transform: scale(.96); }
.aitipbtn.loading { opacity: .7; cursor: wait; }
.aitipbox { background: linear-gradient(135deg, rgba(168,122,78,.06), rgba(168,122,78,.12)); border: 1px solid rgba(168,122,78,.18); border-radius: 13px; padding: 12px 14px; font-size: 13px; line-height: 1.6; color: #4a4238; white-space: pre-wrap; animation: rise .3s ease; }

/* ─── AI Insights ─── */
.aiinsights-card { position: relative; }
.airefresh { margin-left: auto; background: none; border: none; color: #9a8c78; cursor: pointer; padding: 4px; border-radius: 8px; transition: .2s; display: flex; align-items: center; }
.airefresh:hover { color: #a87a4e; background: rgba(168,122,78,.08); }
.aiinsights-text { font-size: 13.5px; line-height: 1.65; color: #4a4238; white-space: pre-wrap; }
.aiinsights-gen { display: flex; align-items: center; gap: 7px; padding: 11px 20px; border-radius: 13px; border: 1.5px solid rgba(168,122,78,.3); background: linear-gradient(135deg, rgba(168,122,78,.06), rgba(168,122,78,.14)); color: #a87a4e; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .2s; font-family: inherit; margin: 6px auto; }
.aiinsights-gen:hover { background: linear-gradient(135deg, rgba(168,122,78,.14), rgba(168,122,78,.22)); transform: translateY(-1px); }
.aiinsights-gen:active { transform: scale(.97); }

/* ─── AI Coach FAB ─── */
@keyframes pulse-glow { 0%, 100% { box-shadow: 0 4px 20px rgba(168,122,78,.35); } 50% { box-shadow: 0 4px 28px rgba(168,122,78,.55); } }
.aifab { position: fixed; bottom: 82px; right: 18px; z-index: 16; width: 52px; height: 52px; border-radius: 50%; border: none; background: linear-gradient(135deg, #c9a079, #a87a4e); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(168,122,78,.35); transition: transform .25s cubic-bezier(.34,1.4,.64,1), opacity .2s; animation: pulse-glow 3s ease-in-out infinite; }
.aifab:active { transform: scale(.9); }
.aifab.hide { opacity: 0; pointer-events: none; transform: scale(.5); }

/* ─── AI Chat Panel ─── */
@keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
.aipanel { position: fixed; bottom: 0; left: 0; right: 0; z-index: 25; height: 75vh; max-height: 600px; display: flex; flex-direction: column; background: rgba(243,236,223,.96); backdrop-filter: blur(30px) saturate(150%); -webkit-backdrop-filter: blur(30px) saturate(150%); border-top-left-radius: 24px; border-top-right-radius: 24px; box-shadow: 0 -8px 40px rgba(34,29,23,.18); animation: slideUp .35s cubic-bezier(.22,1,.36,1); }
.aiheader { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(34,29,23,.08); flex-shrink: 0; }
.aiheadleft { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #a87a4e; }
.aiheadright { display: flex; align-items: center; gap: 4px; }
.aikeybtn { background: none; border: none; color: #9a8c78; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; }
.aikeybtn:hover { background: rgba(34,29,23,.06); color: #6f6151; }
.aiclosebtn { background: none; border: none; color: #6f6151; cursor: pointer; padding: 4px; border-radius: 8px; display: flex; align-items: center; }
.aiclosebtn:hover { background: rgba(34,29,23,.06); }

.aimessages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: rgba(34,29,23,.12) transparent; }
.aimsg { display: flex; }
.aimsg.user { justify-content: flex-end; }
.aimsg.assistant { justify-content: flex-start; }
.aimsgbubble { max-width: 85%; padding: 11px 15px; border-radius: 18px; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.aimsg.user .aimsgbubble { background: #221d17; color: #f3ecdf; border-bottom-right-radius: 6px; }
.aimsg.assistant .aimsgbubble { background: rgba(255,253,249,.85); border: 1px solid rgba(34,29,23,.08); color: #4a4238; border-bottom-left-radius: 6px; box-shadow: 0 2px 8px rgba(95,68,32,.06); }
@keyframes dotpulse { 0%, 60% { opacity: .3; } 30% { opacity: 1; } }
.aidots { letter-spacing: 3px; animation: dotpulse 1.4s infinite; }

.aiquick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px; flex-shrink: 0; }
.aiquickbtn { padding: 8px 13px; border-radius: 12px; border: 1px solid rgba(168,122,78,.25); background: rgba(168,122,78,.06); color: #a87a4e; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .2s; font-family: inherit; }
.aiquickbtn:hover { background: rgba(168,122,78,.15); }
.aiquickbtn:disabled { opacity: .5; cursor: not-allowed; }

.aiinputrow { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(34,29,23,.08); flex-shrink: 0; background: rgba(243,236,223,.5); }
.aiinput { flex: 1; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(34,29,23,.12); background: rgba(255,253,249,.8); color: #221d17; font-size: 14px; outline: none; font-family: inherit; }
.aiinput::placeholder { color: #b0a288; }
.aisendbtn { width: 40px; height: 40px; border-radius: 50%; border: none; background: linear-gradient(135deg, #c9a079, #a87a4e); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .2s, opacity .2s; flex-shrink: 0; }
.aisendbtn:active { transform: scale(.9); }
.aisendbtn.disabled { opacity: .5; cursor: not-allowed; }

/* ─── API Key Modal ─── */
.aimodal-overlay { position: fixed; inset: 0; z-index: 30; background: rgba(34,29,23,.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; animation: rise .2s ease; }
.aimodal { background: #fffdf9; border-radius: 22px; padding: 24px; width: calc(100% - 40px); max-width: 380px; box-shadow: 0 20px 60px rgba(34,29,23,.25); }
.aimodal-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 700; color: #221d17; margin-bottom: 8px; }
.aimodal-desc { font-size: 13px; color: #8a7b67; line-height: 1.5; margin: 0 0 14px; }
.aimodal-input { width: 100%; padding: 12px 14px; border-radius: 13px; border: 1px solid rgba(34,29,23,.15); background: rgba(34,29,23,.03); color: #221d17; font-size: 14px; font-family: monospace; outline: none; box-sizing: border-box; }
.aimodal-input:focus { border-color: #a87a4e; }
.aimodal-status { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; margin-top: 8px; }
.aimodal-status.good { color: #5a8a5e; }
.aimodal-status.bad { color: #b4452f; }
.aimodal-actions { display: flex; gap: 8px; margin-top: 16px; }
.aimodal-cancel { flex: 1; padding: 12px; border-radius: 13px; border: 1px solid rgba(34,29,23,.12); background: none; color: #6f6151; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.aimodal-save { flex: 1; padding: 12px; border-radius: 13px; border: none; background: #221d17; color: #f3ecdf; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity .2s; }
.aimodal-save:disabled { opacity: .5; cursor: not-allowed; }
.aimodal-save.loading { opacity: .7; }
.aimodal-current { font-size: 11.5px; color: #9a8c78; margin-top: 12px; text-align: center; }

/* ─── iPhone safe-area / Dynamic Island ─── */
.shell { padding-top: calc(env(safe-area-inset-top) + 20px) !important; }
.root { overscroll-behavior: none; }

/* ─── Segment pill alignment fix ─── */
.segpill { left: 4px; }

/* ─── Goal edit ─── */
button.tagline { appearance: none; border: none; cursor: pointer; font-family: inherit; }
.goaledittag { transition: opacity .2s; }
.goaledittag:active { opacity: .75; }
.goaleditrow { display: flex; align-items: flex-end; gap: 7px; }
.goaleditfield { display: flex; flex-direction: column; gap: 3px; }
.goaleditfield span { font-size: 9px; text-transform: uppercase; letter-spacing: .6px; color: #9a8c78; font-weight: 600; margin-left: 2px; }
.goaleditfield input { width: 62px; background: rgba(34,29,23,.05); border: 1px solid rgba(34,29,23,.15); border-radius: 10px; color: #221d17; font-size: 16px; font-weight: 700; padding: 7px 8px; outline: none; text-align: center; font-family: inherit; }
.goaleditfield input:focus { border-color: #a87a4e; }
.goaleditok { width: 36px; height: 36px; border-radius: 10px; border: none; background: #221d17; color: #f3ecdf; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform .2s; }
.goaleditok:active { transform: scale(.92); }

/* ─── Confirm CTA ─── */
.cta.confirm { background: #a87a4e; box-shadow: 0 12px 28px rgba(168,122,78,.35); }

/* ─── Lift selector arrow ─── */
.liftselwrap { position: relative; }
.liftselarrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #6f6151; pointer-events: none; }

/* ─── Heatmap day labels ─── */
.heat-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 5px; }
.heat-daylabel { text-align: center; font-size: 10px; font-weight: 600; color: #b0a288; text-transform: uppercase; letter-spacing: .3px; }
.cell.future { opacity: .25; }

/* ─── iOS input zoom prevention (font-size must be ≥16px) ─── */
.editname { font-size: 16px !important; }
.editreps { font-size: 16px !important; }
`;

