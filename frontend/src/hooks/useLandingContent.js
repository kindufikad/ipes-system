import { useEffect, useState } from 'react';
import campus from '../assets/campus.jpg';
import classroom from '../assets/classroom.jpg';
import dashboard from '../assets/dashboard.jpg';
import mauLogo from '../assets/mau.jpg';
import { publicApi } from '../services/api';

const defaultLandingContent = {
  home_hero_images: [campus, classroom, dashboard],
  about_page_image: campus,
  system_logo: mauLogo,
  university_logo: mauLogo,
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

const useLandingContent = () => {
  const [content, setContent] = useState(defaultLandingContent);

  useEffect(() => {
    let isMounted = true;
    const loadLandingContent = async () => {
      try {
        const remoteContent = await publicApi.getLandingContent();
        if (!isMounted) return;
        setContent({
          ...defaultLandingContent,
          ...remoteContent,
          contact: { ...defaultLandingContent.contact, ...(remoteContent?.contact || {}) },
          vision: { ...defaultLandingContent.vision, ...(remoteContent?.vision || {}) },
          mission: { ...defaultLandingContent.mission, ...(remoteContent?.mission || {}) },
          objectives: { ...defaultLandingContent.objectives, ...(remoteContent?.objectives || {}) },
          announcements: Array.isArray(remoteContent?.announcements) ? remoteContent.announcements : [],
          social_links: { ...defaultLandingContent.social_links, ...(remoteContent?.social_links || {}) },
          home_hero_images: remoteContent?.home_hero_images?.length
            ? remoteContent.home_hero_images
            : defaultLandingContent.home_hero_images,
          about_page_image: remoteContent?.about_page_image || defaultLandingContent.about_page_image,
          system_logo: remoteContent?.system_logo || defaultLandingContent.system_logo,
          university_logo: remoteContent?.university_logo || defaultLandingContent.university_logo,
        });
      } catch {
        if (isMounted) setContent(defaultLandingContent);
      }
    };
    void loadLandingContent();

    return () => {
      isMounted = false;
    };
  }, []);

  return content;
};

export default useLandingContent;
