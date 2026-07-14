import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en/translation.json';
import de from '@/locales/de/translation.json';
import fr from '@/locales/fr/translation.json';
import ru from '@/locales/ru/translation.json';

function initialLang(): string {
  try {
    const raw = localStorage.getItem('flint-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.language) return parsed.language;
    }
  } catch { /* ignore */ }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    ru: { translation: ru },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;