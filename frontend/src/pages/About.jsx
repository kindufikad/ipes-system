import useLandingContent from '../hooks/useLandingContent';
import { useTranslation } from '../context/useTranslation';
import { FaBullseye, FaCheckCircle, FaEye, FaUniversity } from 'react-icons/fa';

const About = () => {
  const landingContent = useLandingContent();
  const { t, language } = useTranslation();
  const remoteObjectives = landingContent.objectives?.[language];
  const objectives = Array.isArray(remoteObjectives) && remoteObjectives.length
    ? remoteObjectives
    : t('about.objectives', []);
  const mission = landingContent.mission?.[language] || t('about.mission_description');
  const vision = landingContent.vision?.[language] || t('about.vision_description');

  return (
    <div className="bg-slate-50 py-12 dark:bg-slate-950 sm:py-16">
      <div className="container-custom space-y-8 sm:space-y-10">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            {t('about.title')}
          </h1>
          <p className="mt-3 text-sm font-bold text-ieps-blue-600">
            {t('about.system_name')}
          </p>
        </header>

        <figure className="mx-auto aspect-[5/2] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <img
            src={landingContent.about_page_image}
            alt={t('about.campus_image_alt')}
            className="h-full w-full object-cover object-top"
          />
        </figure>

        <section
          aria-labelledby="about-who-we-are"
          className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ieps-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
              <FaUniversity aria-hidden="true" className="text-xl" />
            </span>
            <div>
              <h2 id="about-who-we-are" className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('about.who_we_are_title')}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {t('about.description')}
              </p>
            </div>
          </div>
        </section>

        <section aria-label={`${t('about.vision_title')} and ${t('about.mission_title')}`} className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <FaEye aria-hidden="true" className="text-xl" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
              {t('about.vision_title')}
            </h2>
            <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{vision}</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <FaBullseye aria-hidden="true" className="text-xl" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
              {t('about.mission_title')}
            </h2>
            <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{mission}</p>
          </article>
        </section>

        <section
          aria-labelledby="about-objectives"
          className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8"
        >
          <h2 id="about-objectives" className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('about.objectives_title')}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {objectives.map((objective, index) => (
              <li key={`${index}-${objective}`} className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <FaCheckCircle aria-hidden="true" className="mt-1 shrink-0 text-ieps-blue-600 dark:text-blue-400" />
                <span className="leading-6">{objective}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default About;
