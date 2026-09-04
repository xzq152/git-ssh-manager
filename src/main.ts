// 必须用 compat 版：标准 tailwind reset 会把 button 背景强制置为 transparent，
// 覆盖掉 naive-ui 实心按钮的 background-color（表现为白底上白字看不见）
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import "./styles/base.css";

import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
