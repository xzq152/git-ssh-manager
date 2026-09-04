import { computed, ref } from "vue";
import { darkTheme, type GlobalTheme, type GlobalThemeOverrides } from "naive-ui";
import { invoke } from "@tauri-apps/api/core";

export type ThemeName = "light" | "dark";

const FONT_FAMILY =
  '"Segoe UI Variable Text", "Segoe UI", Inter, system-ui, -apple-system, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
const MONO_FAMILY = '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace';

/** 当前主题，由系统主题驱动。 */
export const themeName = ref<ThemeName>("light");
export const isDark = computed(() => themeName.value === "dark");

/** 传给 NConfigProvider 的主题对象。 */
export const naiveTheme = computed<GlobalTheme | null>(() => (isDark.value ? darkTheme : null));

/** naive-ui 主题覆盖：小圆角 + Fluent 配色 + 半透明表面。 */
export const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = isDark.value;

  const text1 = dark ? "#f5f5f5" : "#1b1b1f";
  const text2 = dark ? "#adadad" : "#5b5b5b";
  const text3 = dark ? "#8b8b8b" : "#8a8a8a";
  const accent = dark ? "#479ef5" : "#0f6cbd";
  const accentHover = dark ? "#62abf5" : "#115ea3";
  const accentPressed = dark ? "#2886de" : "#0c3b5e";
  const danger = dark ? "#f1707b" : "#c50f1f";
  const dangerHover = dark ? "#f8919a" : "#a80010";
  const success = dark ? "#6bb700" : "#0e700e";
  const warning = dark ? "#f0c000" : "#9a6700";

  const cardColor = dark ? "rgba(41,41,41,0.62)" : "rgba(255,255,255,0.72)";
  const modalColor = dark ? "rgba(44,44,44,0.96)" : "rgba(255,255,255,0.96)";
  const popoverColor = dark ? "rgba(44,44,44,0.96)" : "rgba(255,255,255,0.96)";
  const tableHeaderColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputColor = dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)";
  const inputColorDisabled = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
  const borderColor = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
  const dividerColor = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
  const hoverColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const codeColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.045)";

  return {
    common: {
      fontFamily: FONT_FAMILY,
      fontFamilyMono: MONO_FAMILY,
      fontSize: "14px",
      fontSizeSmall: "13px",
      fontSizeMedium: "14px",
      fontSizeLarge: "15px",
      lineHeight: "1.5",

      baseColor: text1,
      primaryColor: accent,
      primaryColorHover: accentHover,
      primaryColorPressed: accentPressed,
      primaryColorSuppl: accentHover,
      infoColor: accent,
      infoColorHover: accentHover,
      infoColorPressed: accentPressed,
      infoColorSuppl: accentHover,
      successColor: success,
      successColorHover: success,
      successColorPressed: success,
      successColorSuppl: success,
      warningColor: warning,
      warningColorHover: warning,
      warningColorPressed: warning,
      warningColorSuppl: warning,
      errorColor: danger,
      errorColorHover: dangerHover,
      errorColorPressed: danger,
      errorColorSuppl: dangerHover,

      textColorBase: text1,
      textColor1: text1,
      textColor2: text2,
      textColor3: text3,
      textColorDisabled: dark ? "#5e5e5e" : "#bdbdbd",
      placeholderColor: dark ? "#8b8b8b" : "#8a8a8a",

      bodyColor: "transparent",
      cardColor,
      modalColor,
      popoverColor,
      tableColor: cardColor,
      tableHeaderColor,
      inputColor,
      inputColorDisabled,
      actionColor: hoverColor,
      codeColor,
      hoverColor,
      borderColor,
      dividerColor,

      // 现代简约：统一小圆角
      borderRadius: "4px",
      borderRadiusSmall: "3px",
      borderRadiusMedium: "4px",
      borderRadiusLarge: "6px",

      heightSmall: "28px",
      heightMedium: "32px",
      heightLarge: "38px",

      boxShadow1: dark
        ? "0 1px 2px rgba(0,0,0,0.28), 0 0 2px rgba(0,0,0,0.24)"
        : "0 1px 2px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)",
      boxShadow2: dark
        ? "0 1px 2px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.28)"
        : "0 1px 2px rgba(0,0,0,0.14), 0 2px 4px rgba(0,0,0,0.14)",
      boxShadow3: dark
        ? "0 4px 8px rgba(0,0,0,0.32), 0 8px 16px rgba(0,0,0,0.36)"
        : "0 4px 8px rgba(0,0,0,0.14), 0 8px 16px rgba(0,0,0,0.14)",
    },
    Card: {
      borderColor: dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
      borderRadius: "6px",
      paddingMedium: "16px",
    },
    Button: {
      borderRadiusTiny: "3px",
      borderRadiusSmall: "3px",
      borderRadiusMedium: "4px",
      borderRadiusLarge: "6px",
      fontWeight: "600",
      fontWeightStrong: "600",
      paddingMedium: "0 14px",
      paddingSmall: "0 10px",
    },
    Input: { borderRadius: "4px" },
    Select: { peers: { InternalSelection: { borderRadius: "4px" } } },
    Checkbox: { borderRadius: "3px" },
    Tag: { borderRadius: "3px" },
    DataTable: {
      borderRadius: "6px",
      thPaddingMedium: "8px 12px",
      tdPaddingMedium: "8px 12px",
      thFontWeight: "600",
      thTextColor: text2,
      thColor: tableHeaderColor,
      borderColor: dividerColor,
      tdColorHover: hoverColor,
    },
    Divider: { color: dividerColor },
    Drawer: { bodyPadding: "0", headerPadding: "14px 18px", footerPadding: "12px 18px" },
    Modal: { borderRadius: "6px" },
    Message: { borderRadius: "4px" },
    Tooltip: { borderRadius: "4px" },
  } as GlobalThemeOverrides;
});

/** 把主题同步到 document（驱动 CSS 变量）与原生窗口（驱动 Mica 深浅）。 */
function applyTheme(name: ThemeName) {
  themeName.value = name;
  document.documentElement.dataset.theme = name;
  // 失败无所谓：不支持 Mica 的平台本来就没有材质效果
  invoke("set_window_theme", { dark: name === "dark" }).catch(() => undefined);
}

/** 查询窗口是否真的拿到了系统材质：拿到就让页面背景透明透出 Mica。 */
export async function initWindowEffect() {
  try {
    const effect = await invoke<string>("window_effect");
    if (effect && effect !== "none") {
      document.documentElement.dataset.windowEffect = effect;
    }
  } catch {
    // 非 Tauri 环境或命令不存在时保持不透明兜底
  }
}

let started = false;

/** 启动系统主题监听：优先用 Tauri 的窗口主题，再用媒体查询兜底。 */
export async function initThemeSync() {
  if (started) return;
  started = true;

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(media.matches ? "dark" : "light");

  media.addEventListener("change", (event) => {
    applyTheme(event.matches ? "dark" : "light");
  });

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    const theme = await appWindow.theme();
    if (theme) applyTheme(theme === "dark" ? "dark" : "light");
    await appWindow.onThemeChanged(({ payload }) => {
      applyTheme(payload === "dark" ? "dark" : "light");
    });
  } catch {
    // 非 Tauri 环境（浏览器预览）或 API 不可用时，仅靠媒体查询
  }
}
