const pool = require('../config/db');

const SETTINGS_KEY = 'landing_page_settings';
const ASSET_KEYS = ['home_hero_images', 'about_page_image', 'system_logo', 'university_logo'];
const CONTACT_KEYS = ['contact_email', 'contact_phone', 'contact_office_hours'];
const LEGACY_KEYS = [...ASSET_KEYS, ...CONTACT_KEYS];

const defaultLandingPageSettings = {
  assets: {
    home_hero_images: [],
    about_page_image: null,
    system_logo: null,
    university_logo: null,
  },
  contact: {
    email: 'kindufikad085@gmail.com',
    phone: '+251 961806188',
    office_hours: 'Monday-Saturday, 2:00 - 11:00',
  },
  vision: { en: '', am: '' },
  mission: { en: '', am: '' },
  objectives: { en: [], am: [] },
  announcements: [],
  social_links: {
    facebook: 'https://www.facebook.com/MekdelaAmbaUniversityOfficial',
    telegram: 'https://t.me/MekdelaAmbaUniversity_MAU',
    linkedin: 'https://www.linkedin.com/school/mekdela-amba-university/',
    youtube: 'https://www.youtube.com/@mekdelaambauniversity',
  },
};

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const normalizeLandingPageSettings = (value = {}, legacy = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const sourceAssets = source.assets && typeof source.assets === 'object' ? source.assets : {};
  const sourceContact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  const sourceSocialLinks = source.social_links && typeof source.social_links === 'object' ? source.social_links : {};
  const sourceObjectives = source.objectives && typeof source.objectives === 'object' ? source.objectives : {};

  return {
    assets: {
      ...defaultLandingPageSettings.assets,
      ...sourceAssets,
      home_hero_images: Array.isArray(legacy.home_hero_images)
        ? legacy.home_hero_images
        : Array.isArray(sourceAssets.home_hero_images) ? sourceAssets.home_hero_images : [],
      about_page_image: legacy.about_page_image ?? sourceAssets.about_page_image ?? null,
      system_logo: legacy.system_logo ?? sourceAssets.system_logo ?? null,
      university_logo: legacy.university_logo ?? sourceAssets.university_logo ?? null,
    },
    contact: {
      ...defaultLandingPageSettings.contact,
      ...sourceContact,
      email: legacy.contact_email || sourceContact.email || defaultLandingPageSettings.contact.email,
      phone: legacy.contact_phone || sourceContact.phone || defaultLandingPageSettings.contact.phone,
      office_hours: legacy.contact_office_hours || sourceContact.office_hours || defaultLandingPageSettings.contact.office_hours,
    },
    vision: { ...defaultLandingPageSettings.vision, ...(source.vision || {}) },
    mission: { ...defaultLandingPageSettings.mission, ...(source.mission || {}) },
    objectives: {
      en: Array.isArray(sourceObjectives.en) ? sourceObjectives.en : [],
      am: Array.isArray(sourceObjectives.am) ? sourceObjectives.am : [],
    },
    announcements: Array.isArray(source.announcements) ? source.announcements : [],
    social_links: { ...defaultLandingPageSettings.social_links, ...sourceSocialLinks },
  };
};

const getLandingPageSettings = async () => {
  const settingKeys = [SETTINGS_KEY, ...LEGACY_KEYS];
  const placeholders = settingKeys.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
    settingKeys
  );
  const values = Object.fromEntries((rows || []).map((row) => [row.setting_key, row.setting_value]));
  const legacy = {
    home_hero_images: parseJson(values.home_hero_images, []),
    about_page_image: values.about_page_image,
    system_logo: values.system_logo,
    university_logo: values.university_logo,
    contact_email: values.contact_email,
    contact_phone: values.contact_phone,
    contact_office_hours: values.contact_office_hours,
  };
  const storedSettings = parseJson(values[SETTINGS_KEY], {});
  return normalizeLandingPageSettings(storedSettings, legacy);
};

const saveLandingPageSettings = async (settings) => {
  const normalized = normalizeLandingPageSettings(settings);
  const values = [
    [SETTINGS_KEY, JSON.stringify(normalized)],
    ['home_hero_images', JSON.stringify(normalized.assets.home_hero_images)],
    ['about_page_image', normalized.assets.about_page_image],
    ['system_logo', normalized.assets.system_logo],
    ['university_logo', normalized.assets.university_logo],
    ['contact_email', normalized.contact.email],
    ['contact_phone', normalized.contact.phone],
    ['contact_office_hours', normalized.contact.office_hours],
  ];
  const placeholders = values.map(() => '(?, ?)').join(', ');
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    values.flat()
  );
  return normalized;
};

module.exports = {
  SETTINGS_KEY,
  ASSET_KEYS,
  defaultLandingPageSettings,
  normalizeLandingPageSettings,
  getLandingPageSettings,
  saveLandingPageSettings,
};