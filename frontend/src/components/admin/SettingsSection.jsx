import React, { useContext } from 'react';
import { FaCog, FaShieldAlt } from 'react-icons/fa';
import { LanguageContext } from '../../context/LanguageContext';

const SettingsSection = () => {
  const { strings } = useContext(LanguageContext);
  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
          <FaCog className="text-xl" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{strings.adminSections.settingsTitle}</h2>
          <p className="text-sm text-gray-500">{strings.adminSections.settingsDesc}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-700">
          <FaShieldAlt />
          <span className="font-medium">{strings.adminSections.securityControls}</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">{strings.adminSections.securityControlsText}</p>
      </div>
    </section>
  );
};

export default SettingsSection;
