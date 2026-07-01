/**
 * Chat — editorial AI assistant interface.
 * Full-width layout, clean message bubbles, underline input.
 * No card wrappers. Visual rhythm through spacing.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Send,
  Trash2,
  Bot,
  User,
  Copy,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { useTranslation } from "../i18n";
import { sendChatMessage, clearChatHistory, getChatHistory, getApiKey, updateApiKey } from "../lib/api";
import type { ChatMessage } from "../lib/types";

/* ── Model definitions ───────────────────────────────────────── */

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

const MODELS: ModelOption[] = [
  { id: "xiaomi", name: "mimo-v2.5-pro", provider: "小米" },
  { id: "deepseek", name: "deepseek-chat", provider: "DeepSeek" },
];

/* ── Feature cards for empty state ──────────────────────────── */

function getFeatureCards(t: (k: string) => string) {
  return [
    { icon: "📝", title: t("chat.cmd.record"), desc: "午饭35 / 打车28块", example: "午饭35" },
    { icon: "🔍", title: t("chat.cmd.query"), desc: "这个月花了多少", example: "这个月花了多少" },
    { icon: "💰", title: t("chat.cmd.budget"), desc: "餐饮预算2000", example: "餐饮预算2000" },
    { icon: "📊", title: t("chat.cmd.report"), desc: "生成本月报告", example: "本月报告" },
    { icon: "💡", title: t("chat.cmd.advice"), desc: "给我理财建议", example: "给我理财建议" },
    { icon: "🎯", title: "储蓄目标", desc: "设定存钱计划", example: "设定一个旅行基金目标" },
  ];
}

/* ── Copy helper ────────────────────────────────────────────── */

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

/* ═══════════════════════════════════════════════════════════════ */

export default function Chat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("xiaomi");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Load API key status on mount
  useEffect(() => {
    getApiKey().then(({ api_key, configured }) => {
      setApiKeyConfigured(configured);
      if (configured) {
        setApiKey(api_key);
      }
    }).catch(() => {});
  }, []);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  /* Load history on mount */
  useEffect(() => {
    getChatHistory()
      .then(setMessages)
      .catch(() => {});
  }, []);

  /* Auto-scroll on new messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* Close dropdown on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Handlers ────────────────────────────────────────────── */

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg, timestamp: new Date().toISOString() },
    ]);
    setLoading(true);

    try {
      const result = await sendChatMessage(msg, selectedModel);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          action: result.action,
          data: result.data,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "发送失败";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${msg}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    await clearChatHistory();
    setMessages([]);
  };

  const handleCopy = async (content: string, idx: number) => {
    await copyToClipboard(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleRegenerate = async (idx: number) => {
    let userMsg = "";
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userMsg = messages[i].content;
        break;
      }
    }
    if (!userMsg) return;

    setMessages((prev) => prev.filter((_, i) => i !== idx));
    setLoading(true);

    try {
      const result = await sendChatMessage(userMsg, selectedModel);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          action: result.action,
          data: result.data,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "发送失败";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${msg}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const featureCards = getFeatureCards(t);
  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  const actionBtnStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s cubic-bezier(0.25, 1, 0.5, 1)",
  };

  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 100px)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        {/* Model selector + API key */}
        <div ref={dropdownRef} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            ref={buttonRef}
            onClick={() => {
              if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 4, left: rect.left });
              }
              setShowModelPicker(!showModelPicker);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: "var(--bg-page)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text-secondary)",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontWeight: 500 }}>{currentModel.provider}</span>
            <span style={{ color: "var(--text-tertiary)", margin: "0 2px" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{currentModel.name}</span>
            <ChevronDown
              size={12}
              style={{
                color: "var(--text-tertiary)",
                transform: showModelPicker ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {/* API Key 配置入口 */}
          <button
            onClick={() => setShowApiKeyModal(true)}
            style={{
              padding: "5px 10px",
              background: apiKeyConfigured ? "var(--color-primary-light)" : "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              color: apiKeyConfigured ? "var(--color-primary)" : "var(--text-tertiary)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
            }}
          >
            {apiKeyConfigured ? "API Key ✓" : "API Key"}
          </button>

          {showModelPicker && createPortal(
            <div
              ref={dropdownRef}
              style={{
                position: "fixed",
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: 220,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                boxShadow: "var(--shadow-xl)",
                zIndex: 9999,
                overflow: "hidden",
              }}
            >
              {MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setShowModelPicker(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 14px",
                    background:
                      selectedModel === model.id
                        ? "var(--color-primary-light)"
                        : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModel !== model.id)
                      e.currentTarget.style.background = "var(--neutral-100)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModel !== model.id)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{model.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{model.provider}</div>
                  </div>
                  {selectedModel === model.id && (
                    <Check size={14} style={{ color: "var(--color-primary)" }} />
                  )}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        <Button variant="ghost" onClick={handleClear}>
          <Trash2 size={14} />
          {t("chat.clear")}
        </Button>
      </div>

      {/* ── Messages area — subtle background for depth ──────── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 32px",
          background: "var(--neutral-100)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── Empty state ─────────────────────────────────── */}
        {messages.length === 0 && !loading && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 20px",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <Bot size={28} color="white" />
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              你好，我是小账
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-tertiary)",
                marginBottom: 40,
                textAlign: "center",
                maxWidth: 400,
              }}
            >
              你的 AI 财务助手，可以帮你记账、查账、做预算、给建议
            </p>


          </div>
        )}

        {/* ── Message list ────────────────────────────────── */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className="chat-message"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            {/* AI Avatar */}
            {msg.role === "assistant" && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Bot size={16} color="white" />
              </div>
            )}

            {/* Bubble + actions */}
            <div style={{ maxWidth: "70%", position: "relative" }}>
              <div
                className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}
                style={{
                  padding: "14px 18px",
                  borderRadius:
                    msg.role === "user"
                      ? "16px 16px 4px 16px"
                      : "16px 16px 16px 4px",
                  background:
                    msg.role === "user"
                      ? "var(--color-primary)"
                      : "var(--bg-surface)",
                  color: msg.role === "user" ? "white" : "var(--text-primary)",
                  border:
                    msg.role === "user"
                      ? "none"
                      : "1px solid var(--border-subtle)",
                  fontSize: 15,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
                {msg.action && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "5px 10px",
                      borderRadius: 6,
                      background:
                        msg.role === "user"
                          ? "rgba(255,255,255,0.15)"
                          : "var(--neutral-100)",
                      fontSize: 11,
                      color:
                        msg.role === "user"
                          ? "rgba(255,255,255,0.8)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    🔧 {msg.action}
                  </div>
                )}
              </div>

              {/* Hover actions */}
              <div
                className="msg-hover-actions"
                style={{
                  display: "flex",
                  gap: 4,
                  marginTop: 6,
                  justifyContent:
                    msg.role === "assistant" ? "flex-start" : "flex-end",
                }}
              >
                <button
                  onClick={() => handleCopy(msg.content, i)}
                  title="Copy"
                  style={actionBtnStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--neutral-100)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                </button>
                {msg.role === "assistant" && (
                  <button
                    onClick={() => handleRegenerate(i)}
                    title="Regenerate"
                    style={actionBtnStyle}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--neutral-100)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* User Avatar */}
            {msg.role === "user" && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--neutral-200)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User size={16} color="var(--text-secondary)" />
              </div>
            )}
          </div>
        ))}

        {/* ── Loading indicator ───────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Bot size={16} color="white" />
            </div>
            <div
              className="chat-bubble-assistant"
              style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--text-tertiary)",
                    animation: `typingBounce 1.4s infinite ${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area — editorial underline style ──────── */}
      <div
        style={{
          padding: "20px 0 16px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <div className="input-wrapper" style={{ flex: 1 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t("chat.placeholder")}
              rows={1}
              className="input"
              style={{
                maxHeight: 120,
                resize: "none",
              }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              alignSelf: "stretch",
              padding: "0 20px",
              borderRadius: 12,
              background: input.trim() ? "var(--color-primary)" : "var(--neutral-200)",
              color: input.trim() ? "white" : "var(--text-tertiary)",
              border: "none",
              cursor: input.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
              flexShrink: 0,
              boxShadow: input.trim() ? "0 4px 16px rgba(8, 145, 178, 0.35)" : "none",
              transform: input.trim() ? "translateY(-1px)" : "none",
              opacity: loading ? 0.6 : 1,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {loading ? (
              <div style={{ display: "flex", gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "currentColor",
                      animation: `typingBounce 1.4s infinite ${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                <Send size={16} strokeWidth={2.5} />
                <span>发送</span>
              </>
            )}
          </button>
        </div>

        <p
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 12,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.03em",
            opacity: 0.7,
          }}
        >
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>

      {/* ── Inline CSS ──────────────────────────────────────── */}
      <style>{`
        .msg-hover-actions {
          opacity: 0;
          transition: opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .chat-message:hover .msg-hover-actions {
          opacity: 1;
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        /* Chat bubble shadows */
        .chat-bubble-user {
          box-shadow: 0 4px 12px rgba(13, 115, 119, 0.2);
        }
        .chat-bubble-assistant {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
      `}</style>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowApiKeyModal(false)}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 16,
              padding: 28,
              width: 400,
              boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>API Key 配置</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                当前模型: {currentModel.provider} / {currentModel.name}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeyConfigured ? "已配置，输入新 Key 覆盖" : "输入 API Key..."}
                className="input"
                style={{ fontSize: 14 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowApiKeyModal(false);
                  setApiKey("");
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!apiKey.trim()) return;
                  setApiKeyLoading(true);
                  try {
                    await updateApiKey(apiKey);
                    setApiKeyConfigured(true);
                    setShowApiKeyModal(false);
                    setApiKey("");
                  } catch (err) {
                    console.error("Failed to update API key:", err);
                  } finally {
                    setApiKeyLoading(false);
                  }
                }}
                disabled={apiKeyLoading || !apiKey.trim()}
                style={{
                  padding: "8px 16px",
                  background: apiKey.trim() ? "var(--color-primary)" : "var(--border-subtle)",
                  border: "none",
                  borderRadius: 8,
                  cursor: apiKey.trim() ? "pointer" : "not-allowed",
                  fontSize: 13,
                  color: "white",
                  fontWeight: 500,
                  opacity: apiKeyLoading ? 0.7 : 1,
                }}
              >
                {apiKeyLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
