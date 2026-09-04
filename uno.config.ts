import { defineConfig, presetUno } from "unocss";

/**
 * UnoCSS 只负责布局类原子样式，主题色统一走 CSS 变量（见 src/styles/base.css），
 * 这样 naive-ui 的 themeOverrides 与手写样式能共用同一套设计令牌。
 *
 * 注意：这里关闭了 preflight，避免与 naive-ui 自带样式互相覆盖。
 */
export default defineConfig({
  presets: [presetUno({ preflight: false })],

  theme: {
    colors: {
      accent: "var(--accent)",
      "accent-hover": "var(--accent-hover)",
      danger: "var(--danger)",
      success: "var(--success)",
      warning: "var(--warning)",
      "text-1": "var(--text-1)",
      "text-2": "var(--text-2)",
      "text-3": "var(--text-3)",
      surface: "var(--surface-card)",
      stroke: "var(--stroke-card)",
    },
    borderRadius: {
      xs: "var(--radius-xs)",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
    },
  },

  shortcuts: {
    // 页面卡片：统一的小圆角 + 半透明表面 + 细描边
    "ui-card":
      "border border-[var(--stroke-card)] rounded-[var(--radius-lg)] bg-[var(--surface-card)]",
    // 行内操作按钮组
    "ui-row": "flex items-center gap-2",
  },
});
