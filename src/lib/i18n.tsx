import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "es" | "pt" | "fr" | "de";
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

// Translations for Settings dialog strings. Extend per key/lang over time.
const DICT: Record<Lang, Record<string, string>> = {
  en: {},
  es: {
    "settings.general": "General",
    "settings.notifications": "Notificaciones",
    "settings.personalization": "Personalización",
    "settings.connections": "Conexiones",
    "settings.billing": "Uso y facturación",
    "settings.data": "Controles de datos",
    "settings.security": "Seguridad",
    "settings.account": "Cuenta",
    "settings.help": "Ayuda",
    "settings.appearance": "Apariencia",
    "settings.appearance.desc": "Tema claro u oscuro.",
    "settings.language": "Idioma",
    "settings.language.desc": "Idioma de la interfaz.",
    "settings.export": "Exportar datos",
    "settings.export.desc": "Descarga tus candidatos desbloqueados en CSV.",
    "settings.delete_account": "Eliminar cuenta",
    "settings.delete_account.desc": "Elimina permanentemente tu cuenta y todos tus datos.",
  },
  pt: {
    "settings.general": "Geral",
    "settings.notifications": "Notificações",
    "settings.personalization": "Personalização",
    "settings.connections": "Conexões",
    "settings.billing": "Uso e cobrança",
    "settings.data": "Controles de dados",
    "settings.security": "Segurança",
    "settings.account": "Conta",
    "settings.help": "Ajuda",
    "settings.appearance": "Aparência",
    "settings.appearance.desc": "Tema claro ou escuro.",
    "settings.language": "Idioma",
    "settings.language.desc": "Idioma da interface.",
    "settings.export": "Exportar dados",
    "settings.export.desc": "Baixe seus candidatos desbloqueados em CSV.",
    "settings.delete_account": "Excluir conta",
    "settings.delete_account.desc": "Exclui permanentemente sua conta e todos os dados.",
  },
  fr: {
    "settings.general": "Général",
    "settings.notifications": "Notifications",
    "settings.personalization": "Personnalisation",
    "settings.connections": "Connexions",
    "settings.billing": "Usage et facturation",
    "settings.data": "Contrôles des données",
    "settings.security": "Sécurité",
    "settings.account": "Compte",
    "settings.help": "Aide",
    "settings.appearance": "Apparence",
    "settings.appearance.desc": "Thème clair ou sombre.",
    "settings.language": "Langue",
    "settings.language.desc": "Langue de l'interface.",
    "settings.export": "Exporter les données",
    "settings.export.desc": "Téléchargez vos candidats débloqués en CSV.",
    "settings.delete_account": "Supprimer le compte",
    "settings.delete_account.desc": "Supprime définitivement votre compte et toutes les données.",
  },
  de: {
    "settings.general": "Allgemein",
    "settings.notifications": "Benachrichtigungen",
    "settings.personalization": "Personalisierung",
    "settings.connections": "Verbindungen",
    "settings.billing": "Nutzung & Abrechnung",
    "settings.data": "Datenkontrolle",
    "settings.security": "Sicherheit",
    "settings.account": "Konto",
    "settings.help": "Hilfe",
    "settings.appearance": "Erscheinungsbild",
    "settings.appearance.desc": "Helles oder dunkles Theme.",
    "settings.language": "Sprache",
    "settings.language.desc": "Sprache der Oberfläche.",
    "settings.export": "Daten exportieren",
    "settings.export.desc": "Lade deine freigeschalteten Kandidaten als CSV herunter.",
    "settings.delete_account": "Konto löschen",
    "settings.delete_account.desc": "Lösche dein Konto und alle Daten dauerhaft.",
  },
};

const STORAGE_KEY = "findable:language";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (raw && LANGUAGES.some((l) => l.code === raw)) {
        setLangState(raw);
        document.documentElement.lang = raw;
      }
    } catch {
      /* noop */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    } catch {
      /* noop */
    }
  };

  const t = (key: string, fallback: string) => DICT[lang]?.[key] ?? fallback;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback when used outside provider (SSR, tests)
    return {
      lang: "en" as Lang,
      setLang: () => {},
      t: (_k: string, fallback: string) => fallback,
    };
  }
  return ctx;
}