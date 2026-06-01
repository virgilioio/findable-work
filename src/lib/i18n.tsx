import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "es" | "pt" | "fr" | "de";
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

// Translations for visible UI chrome. Keys use dot-namespaces (auth.*,
// nav.*, settings.*, common.*). Missing keys fall back to the English string
// passed to t(). AI-generated content is NOT translated here — the AI
// auto-detects the language the user writes in.
const DICT: Record<Lang, Record<string, string>> = {
  en: {},
  es: {
    "common.signout": "Cerrar sesión",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.loading": "Cargando…",
    "auth.signin.title": "Inicia sesión en findable",
    "auth.signup.title": "Empieza a contratar con findable",
    "auth.continue_google": "Continuar con Google",
    "auth.or": "O",
    "auth.email": "Correo electrónico",
    "auth.password": "Contraseña",
    "auth.forgot": "¿Olvidaste tu contraseña?",
    "auth.signin": "Iniciar sesión",
    "auth.signup": "Crear cuenta",
    "auth.signing_in": "Iniciando sesión…",
    "auth.new_here": "¿Eres nuevo en findable?",
    "auth.already": "¿Ya tienes una cuenta?",
    "auth.create_account": "Crear una cuenta",
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
    "settings.language.desc": "Idioma de la interfaz. El contenido generado por IA se adapta a tu idioma automáticamente.",
    "settings.export": "Exportar datos",
    "settings.export.desc": "Descarga tus candidatos desbloqueados en CSV.",
    "settings.delete_account": "Eliminar cuenta",
    "settings.delete_account.desc": "Elimina permanentemente tu cuenta y todos tus datos.",
  },
  pt: {
    "common.signout": "Sair",
    "common.save": "Salvar",
    "common.cancel": "Cancelar",
    "common.delete": "Excluir",
    "common.loading": "Carregando…",
    "auth.signin.title": "Entrar no findable",
    "auth.signup.title": "Comece a contratar com findable",
    "auth.continue_google": "Continuar com Google",
    "auth.or": "Ou",
    "auth.email": "E-mail",
    "auth.password": "Senha",
    "auth.forgot": "Esqueceu a senha?",
    "auth.signin": "Entrar",
    "auth.signup": "Criar conta",
    "auth.signing_in": "Entrando…",
    "auth.new_here": "Novo no findable?",
    "auth.already": "Já tem uma conta?",
    "auth.create_account": "Criar uma conta",
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
    "settings.language.desc": "Idioma da interface. O conteúdo gerado pela IA se adapta automaticamente ao seu idioma.",
    "settings.export": "Exportar dados",
    "settings.export.desc": "Baixe seus candidatos desbloqueados em CSV.",
    "settings.delete_account": "Excluir conta",
    "settings.delete_account.desc": "Exclui permanentemente sua conta e todos os dados.",
  },
  fr: {
    "common.signout": "Se déconnecter",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.loading": "Chargement…",
    "auth.signin.title": "Se connecter à findable",
    "auth.signup.title": "Commencez à recruter avec findable",
    "auth.continue_google": "Continuer avec Google",
    "auth.or": "Ou",
    "auth.email": "E-mail",
    "auth.password": "Mot de passe",
    "auth.forgot": "Mot de passe oublié ?",
    "auth.signin": "Se connecter",
    "auth.signup": "Créer un compte",
    "auth.signing_in": "Connexion…",
    "auth.new_here": "Nouveau sur findable ?",
    "auth.already": "Vous avez déjà un compte ?",
    "auth.create_account": "Créer un compte",
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
    "settings.language.desc": "Langue de l'interface. Le contenu généré par l'IA s'adapte automatiquement à votre langue.",
    "settings.export": "Exporter les données",
    "settings.export.desc": "Téléchargez vos candidats débloqués en CSV.",
    "settings.delete_account": "Supprimer le compte",
    "settings.delete_account.desc": "Supprime définitivement votre compte et toutes les données.",
  },
  de: {
    "common.signout": "Abmelden",
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.delete": "Löschen",
    "common.loading": "Wird geladen…",
    "auth.signin.title": "Bei findable anmelden",
    "auth.signup.title": "Starte das Recruiting mit findable",
    "auth.continue_google": "Mit Google fortfahren",
    "auth.or": "Oder",
    "auth.email": "E-Mail",
    "auth.password": "Passwort",
    "auth.forgot": "Passwort vergessen?",
    "auth.signin": "Anmelden",
    "auth.signup": "Konto erstellen",
    "auth.signing_in": "Anmeldung…",
    "auth.new_here": "Neu bei findable?",
    "auth.already": "Hast du schon ein Konto?",
    "auth.create_account": "Konto erstellen",
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
    "settings.language.desc": "Sprache der Oberfläche. KI-generierte Inhalte passen sich automatisch deiner Sprache an.",
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