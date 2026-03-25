/** Keyframes + classes for Caleno help-bot “thinking / gathering” animation (shared). */
export const CALENO_HELP_THINKING_CSS = `
@keyframes calenoHelpThinkBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
@keyframes calenoHelpThinkRing {
  0% { transform: scale(0.88); opacity: 0.55; }
  65%, 100% { transform: scale(1.45); opacity: 0; }
}
@keyframes calenoHelpThinkDot {
  0%, 100% { opacity: 0.2; transform: translateY(0) scale(0.85); }
  50% { opacity: 1; transform: translateY(-5px) scale(1.05); }
}
@keyframes calenoHelpThinkShimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.caleno-help-thinking-avatar {
  animation: calenoHelpThinkBreathe 1.35s ease-in-out infinite;
}
.caleno-help-thinking-ring {
  animation: calenoHelpThinkRing 1.5s cubic-bezier(0.35, 0, 0.2, 1) infinite;
}
.caleno-help-thinking-dot {
  animation: calenoHelpThinkDot 0.85s ease-in-out infinite;
}
.caleno-help-thinking-label {
  background: linear-gradient(90deg, #64748b 0%, #1e6f7c 40%, #64748b 80%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: calenoHelpThinkShimmer 2s ease-in-out infinite;
}
`;
