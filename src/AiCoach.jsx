import React, { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Key, CheckCircle, AlertCircle } from "lucide-react";
import {
  hasApiKey, getApiKey, setApiKey, validateKey,
  buildContext, streamChat, SYSTEM_PROMPTS,
} from "./openai";

const QUICK_PROMPTS = [
  "How was my week?",
  "What should I focus on today?",
  "Am I overtraining?",
  "Nutrition tips for my goals",
  "Help me break a plateau",
];

export default function AiCoach({ plan, logs, body, notes }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState("idle"); // idle | checking | valid | invalid
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const scrollBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleOpen = () => {
    if (!hasApiKey()) {
      setShowKeyModal(true);
      return;
    }
    setOpen(true);
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: "Hey! 💪 I'm your AI Coach. I can see your workout plan, recent sessions, and body stats. Ask me anything about training, form, nutrition, or recovery!" }]);
    }
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setKeyStatus("checking");
    const valid = await validateKey(keyInput.trim());
    if (valid) {
      setApiKey(keyInput.trim());
      setKeyStatus("valid");
      setTimeout(() => { setShowKeyModal(false); setKeyStatus("idle"); setOpen(true); handleOpen(); }, 800);
    } else {
      setKeyStatus("invalid");
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;
    const userMsg = { role: "user", content: text.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setStreaming(true);
    scrollBottom();

    const context = buildContext(plan, logs, body, notes);
    const systemPrompt = SYSTEM_PROMPTS.coach(context);

    // Add assistant placeholder
    setMessages([...newMsgs, { role: "assistant", content: "" }]);

    try {
      await streamChat(
        newMsgs.filter((m) => m.role !== "system").slice(-10), // last 10 messages for context window
        systemPrompt,
        (partial) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: partial };
            return updated;
          });
          scrollBottom();
        },
        (final) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: final };
            return updated;
          });
          setStreaming(false);
          scrollBottom();
        }
      );
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${err.message}` };
        return updated;
      });
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={"aifab " + (open ? "hide" : "")}
        onClick={handleOpen}
        title="AI Coach"
      >
        <Sparkles size={22} />
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="aipanel">
          <div className="aiheader">
            <div className="aiheadleft">
              <Sparkles size={16} />
              <span>AI Coach</span>
            </div>
            <div className="aiheadright">
              <button className="aikeybtn" onClick={() => setShowKeyModal(true)} title="API Key Settings">
                <Key size={14} />
              </button>
              <button className="aiclosebtn" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="aimessages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={"aimsg " + m.role}>
                <div className="aimsgbubble">
                  {m.content || <span className="aidots">●●●</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Quick prompts — always visible for easy re-use */}
          <div className="aiquick">
            {QUICK_PROMPTS.map((p) => (
              <button key={p} className="aiquickbtn" onClick={() => sendMessage(p)} disabled={streaming}>
                {p}
              </button>
            ))}
          </div>

          <div className="aiinputrow">
            <input
              ref={inputRef}
              className="aiinput"
              placeholder="Ask your AI coach..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
              disabled={streaming}
            />
            <button
              className={"aisendbtn " + (streaming ? "disabled" : "")}
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
            >
              {streaming ? <Loader size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="aimodal-overlay" onClick={() => { setShowKeyModal(false); setKeyStatus("idle"); }}>
          <div className="aimodal" onClick={(e) => e.stopPropagation()}>
            <div className="aimodal-title">
              <Key size={18} />
              <span>OpenAI API Key</span>
            </div>
            <p className="aimodal-desc">
              Your key is stored only in this browser. Never shared or sent anywhere except OpenAI's API.
            </p>
            <input
              className="aimodal-input"
              type="password"
              placeholder="sk-..."
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setKeyStatus("idle"); }}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
            />
            {keyStatus === "valid" && (
              <div className="aimodal-status good"><CheckCircle size={14} /> Key verified! ✓</div>
            )}
            {keyStatus === "invalid" && (
              <div className="aimodal-status bad"><AlertCircle size={14} /> Invalid key. Check and try again.</div>
            )}
            <div className="aimodal-actions">
              <button className="aimodal-cancel" onClick={() => { setShowKeyModal(false); setKeyStatus("idle"); }}>Cancel</button>
              <button
                className={"aimodal-save " + (keyStatus === "checking" ? "loading" : "")}
                onClick={saveKey}
                disabled={keyStatus === "checking" || !keyInput.trim()}
              >
                {keyStatus === "checking" ? "Verifying..." : "Save Key"}
              </button>
            </div>
            {hasApiKey() && (
              <div className="aimodal-current">
                Current key: ••••{getApiKey().slice(-4)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Missing import for Loader used in send button
function Loader({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
