import { useEffect, useState } from 'react';
import { FaEnvelope, FaPhone, FaClock, FaPaperPlane, FaSpinner, FaMapMarkerAlt } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { contactApi, publicApi } from '../services/api';
import { useTranslation } from '../context/useTranslation';

const Contact = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [contactInfo, setContactInfo] = useState({ email: 'simegnawmunye4@gmail.com', phone: '+251 918590820', officeHours: 'Monday-Saturday, 2:00 - 11:00' });
  const officeHoursMatch = String(contactInfo.officeHours || '').match(/^Monday(?:\s*-\s*|\s+to\s+)Saturday(.*)$/i);
  const officeHours = officeHoursMatch
    ? `${t('contact.office_hours_value')}${officeHoursMatch[1]}`
    : contactInfo.officeHours || t('contact.office_hours_value');
  const locationHref = 'https://www.google.com/maps/search/?api=1&query=Mekdela+Amba+University';

  useEffect(() => {
    let cancelled = false;
    publicApi.getContactInfo()
      .then((data) => {
        if (cancelled) return;
        setContactInfo((current) => ({
          email: data?.email || current.email,
          phone: data?.phone || current.phone,
          officeHours: data?.officeHours || current.officeHours,
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
    if (submitError) setSubmitError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const email = formData.email.trim();
    const message = formData.message.trim();

    if (!name || !email || !message) {
      const errorMessage = t('contact.required_error');
      setSubmitError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      const errorMessage = t('contact.email_error');
      setSubmitError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await contactApi.sendMessage({ name, email, message });
      toast.success(t('contact.sent_success'));
      setFormData({ name: '', email: '', message: '' });
    } catch {
      const messageText = t('contact.send_error');
      setSubmitError(messageText);
      toast.error(messageText);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container-custom py-16">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-ieps-blue-600 text-center mb-4">{t('contact.title')}</h1>
        <p className="text-center text-gray-500 mb-12">{t('contact.subtitle')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="col-span-1 space-y-4">
            <a href={`mailto:${contactInfo.email}`} className="card block transition hover:shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-ieps-blue-100 text-ieps-blue-600 flex items-center justify-center">
                  <FaEnvelope />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('contact.email_label')}</p>
                  <p className="font-medium text-gray-700">{contactInfo.email}</p>
                </div>
              </div>
            </a>

            <a href={`tel:${contactInfo.phone.replace(/\s+/g, '')}`} className="card block transition hover:shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <FaPhone />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('contact.phone_label')}</p>
                  <p className="font-medium text-gray-700">{contactInfo.phone}</p>
                </div>
              </div>
            </a>

            <a href={locationHref} target="_blank" rel="noopener noreferrer" className="card block cursor-pointer transition hover:border-blue-500 hover:shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                  <FaMapMarkerAlt />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('contact.location_label')}</p>
                  <p className="font-medium text-gray-700">{t('contact.location_value')}</p>
                </div>
              </div>
            </a>

            <div className="card">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center">
                  <FaClock />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('contact.office_hours_label')}</p>
                  <p className="font-medium text-gray-700">{officeHours}</p>
                </div>
              </div>
            </div>

          </div>

          <div className="col-span-1 md:col-span-2">
            <div className="card">
              <h2 className="text-2xl font-semibold text-ieps-blue-600 mb-6">{t('contact.send_message_title')}</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1">{t('contact.your_name')}</label>
                  <input
                    id="contact-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ieps-blue-500 transition-all"
                    required
                    disabled={isSubmitting}
                    placeholder={t('contact.your_name_placeholder')}
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">{t('contact.email_address')}</label>
                  <input
                    id="contact-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ieps-blue-500 transition-all"
                    required
                    disabled={isSubmitting}
                    placeholder={t('contact.email_placeholder')}
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1">{t('contact.message')}</label>
                  <textarea
                    id="contact-message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows="5"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ieps-blue-500 transition-all resize-none"
                    required
                    disabled={isSubmitting}
                    placeholder={t('contact.message_placeholder')}
                  />
                </div>

                {submitError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-ieps-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-ieps-blue-500 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <FaSpinner className="animate-spin" />
                      {t('contact.sending')}
                    </>
                  ) : (
                    <>
                      <FaPaperPlane />
                      {t('contact.send_button')}
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;