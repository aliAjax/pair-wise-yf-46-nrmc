import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  resources: { zh: { translation: { title: "新闻直播编排台", rundown: "串联单", scripts: "稿件", prompter: "提词器", changes: "突发变更", queue: "应急队列" } }, en: { translation: { title: "News Rundown Control", rundown: "Rundown", scripts: "Scripts", prompter: "Prompter", changes: "Breaking changes", queue: "Emergency queue" } } },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: { escapeValue: false }
});

export default i18n;
