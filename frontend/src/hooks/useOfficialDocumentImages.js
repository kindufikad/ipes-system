import { useEffect, useState } from 'react';

const storageKey = 'ipes-dashboard-settings';
const changeEvent = 'ipes:official-document-images-changed';

const readImages = () => {
  if (typeof window === 'undefined') return { signature: '', stamp: '' };
  try {
    const settings = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    return {
      signature: settings.departmentHeadSignature || '',
      stamp: settings.officialStamp || '',
    };
  } catch (error) {
    console.error('Unable to load official document images:', error);
    return { signature: '', stamp: '' };
  }
};

const useOfficialDocumentImages = () => {
  const [images, setImages] = useState(readImages);

  useEffect(() => {
    const refreshImages = () => setImages(readImages());
    window.addEventListener(changeEvent, refreshImages);
    window.addEventListener('storage', refreshImages);
    return () => {
      window.removeEventListener(changeEvent, refreshImages);
      window.removeEventListener('storage', refreshImages);
    };
  }, []);

  return images;
};

export default useOfficialDocumentImages;
