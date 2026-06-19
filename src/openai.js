// OpenAI API wrapper — lightweight, no SDK needed
// API key stored in localStorage (ff_openai_key), never in source code

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

export function getApiKey() {
  return localStorage.getItem("ff_openai_key") || "";
}

export function setApiKey(key) {
  localStorage.setItem("ff_openai_key", key.trim());
}

export function hasApiKey() {
  return getApiKey().length > 10;
}

// Validate the API key with a minimal request
export async function validateKey(key) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ─── Context builder ─── */
// Builds a compact summary of user's workout data for the AI
export function buildContext(plan, logs, body, notes, opts = {}) {
  const lines = [];

  // Current plan
  if (plan?.length) {
    lines.push("## Workout Plan (Push/Pull/Legs, 6-day split)");
    plan.forEach((d) => {
      if (d.key === "rest") return;
      const exList = d.ex.map((e) => `${e.n} ${e.s}×${e.r}`).join(", ");
      lines.push(`- **${d.name}** (${d.sub}): ${exList}`);
    });
  }

  // Recent logs (last 14 days)
  if (logs?.length) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const recent = logs.filter((l) => new Date(l.date + "T00:00:00") >= cutoff);
    if (recent.length) {
      lines.push("\n## Recent Workouts (last 14 days)");
      recent.forEach((l) => {
        const exSummary = l.exercises
          .map((e) => {
            const sets = e.sets.map((s) => `${s.weight || "?"}kg×${s.reps || "?"}`).join(", ");
            return `${e.n}: [${sets}]`;
          })
          .join("; ");
        lines.push(`- ${l.date} ${l.dayName}: ${exSummary}`);
      });
    }
    lines.push(`\nTotal workouts logged: ${logs.length}`);
  }

  // Body stats
  if (body) {
    lines.push("\n## Body Measurements");
    for (const [key, arr] of Object.entries(body)) {
      if (arr?.length) {
        const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1];
        const unit = key === "weight" ? "kg" : "cm";
        lines.push(`- ${key}: ${latest.v}${unit} (as of ${latest.date}, ${sorted.length} entries)`);
        if (sorted.length >= 2) {
          const first = sorted[0];
          const change = (latest.v - first.v).toFixed(1);
          lines.push(`  Change since ${first.date}: ${change > 0 ? "+" : ""}${change}${unit}`);
        }
      }
    }
  }

  // Exercise notes
  if (notes && Object.keys(notes).length) {
    const filled = Object.entries(notes).filter(([, v]) => v?.trim());
    if (filled.length) {
      lines.push("\n## User's Exercise Notes");
      filled.forEach(([name, note]) => lines.push(`- ${name}: "${note}"`));
    }
  }

  // Extra context from opts
  if (opts.exerciseName) {
    lines.push(`\n## Current Focus: ${opts.exerciseName}`);
    if (opts.exerciseHistory) {
      lines.push(`Recent sets: ${opts.exerciseHistory}`);
    }
  }

  return lines.join("\n");
}

/* ─── System prompts ─── */
export const SYSTEM_PROMPTS = {
  coach: (context) => `You are FORGE AI Coach — a knowledgeable, motivating personal trainer embedded in the user's workout app. You can see their full workout data below.

RULES:
- Be concise but helpful. Use short paragraphs.
- Use emoji sparingly for warmth (💪🔥✅).
- Give actionable, specific advice based on THEIR data.
- For form tips, be precise about cues (e.g., "retract scapula" not just "good form").
- If asked about nutrition, give practical macro guidance.
- Don't diagnose injuries — suggest seeing a professional.
- Reference their actual numbers and history when relevant.

${context}

Today's date: ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,

  exerciseTip: (context) => `You are a concise exercise coach. The user tapped an exercise for quick tips.

RULES:
- Give exactly 3 bullet points:
  1. 🎯 Key form cue (most important)
  2. ⚠️ Common mistake to avoid
  3. 💡 Pro tip (mind-muscle, tempo, breathing, or progression)
- If you see their recent history, add a 4th line about progressive overload.
- Be specific and actionable. Max 15 words per bullet.
- No greetings or fluff.

${context}`,

  insights: (context) => `You are a workout analyst. Analyze the user's recent training data and provide a brief weekly review.

FORMAT (use exactly this structure):
📊 **Volume Check**: [Are they hitting all muscle groups evenly? Any imbalances?]
📈 **Ready to Progress**: [Which specific exercises show they can increase weight? Reference their numbers.]
🔋 **Recovery**: [Training frequency assessment — too much, too little, or on track?]
🔥 **Highlight**: [One motivating observation about their progress or consistency.]

RULES:
- Reference specific exercises and numbers from their data.
- Be honest but encouraging.
- Keep each section to 1-2 sentences max.
- If insufficient data, say what they need to track.

${context}`,
};

/* ─── API call with streaming ─── */
export async function streamChat(messages, systemPrompt, onChunk, onDone) {
  const key = getApiKey();
  if (!key) throw new Error("No API key set");

  const controller = new AbortController();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
        max_tokens: 800,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(fullText);
          }
        } catch {}
      }
    }

    onDone(fullText);
    return fullText;
  } catch (err) {
    if (err.name === "AbortError") return;
    throw err;
  }

  return () => controller.abort();
}

/* ─── Simple (non-streaming) call ─── */
export async function chatComplete(messages, systemPrompt) {
  const key = getApiKey();
  if (!key) throw new Error("No API key set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}
