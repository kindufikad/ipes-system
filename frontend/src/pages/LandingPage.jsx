import { useContext, useEffect, useState } from 'react';
import { BarChart3, Building2, TrendingUp, Users } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import { publicApi } from '../services/api';
import ImageSlider from '../components/ImageSlider';
import WorkflowHierarchy from '../components/WorkflowHierarchy';
import './LandingPage.css';

const LandingPage = () => {
  const { language } = useContext(LanguageContext);
  const [systemStats, setSystemStats] = useState(null);
  const isEnglish = language === 'en';

  useEffect(() => {
    let isMounted = true;

    const loadSystemStats = async () => {
      try {
        const stats = await publicApi.getSystemStats();
        if (isMounted) setSystemStats(stats);
      } catch (error) {
        console.error('Unable to load public system statistics:', error);
        if (isMounted) setSystemStats({});
      }
    };

    void loadSystemStats();
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = [
    {
      id: 'evaluations',
      label: isEnglish ? 'Evaluations Completed' : 'የተጠናቀቁ ግምገማዎች',
      value: systemStats?.evaluationsCompleted,
      icon: BarChart3,
      accent: 'royal',
    },
    {
      id: 'instructors',
      label: isEnglish ? 'Active Instructors' : 'ንቁ መምህራን',
      value: systemStats?.activeInstructors,
      icon: Users,
      accent: 'amber',
    },
    {
      id: 'departments',
      label: isEnglish ? 'Departments' : 'ክፍሎች',
      value: systemStats?.totalDepartments,
      icon: Building2,
      accent: 'indigo',
    },
    {
      id: 'participation',
      label: isEnglish ? 'Student Participation' : 'የተማሪ ተሳትፎ',
      value: systemStats?.studentParticipation !== undefined
        ? `${systemStats.studentParticipation}%`
        : undefined,
      icon: TrendingUp,
      accent: 'royal',
    },
  ];

  return (
    <div className="landing-page">
      <section className="landing-page__hero" aria-label={isEnglish ? 'University highlights' : 'የዩኒቨርሲቲ ዋና ዋና ዜናዎች'}>
        <div className="landing-page__container">
          <ImageSlider />
        </div>
      </section>

      <section className="landing-page__overview" aria-labelledby="landing-page-overview-title">
        <div className="landing-page__container">
          <header className="landing-page__heading">
            <span className="landing-page__eyebrow">IPES · MEKDELA AMBA UNIVERSITY</span>
            <h1 id="landing-page-overview-title">
              {isEnglish ? 'System Overview' : 'የሥርዓቱ አጠቃላይ እይታ'}
            </h1>
            <p>
              {isEnglish
                ? 'Key metrics and performance indicators'
                : 'ቁልፍ መለኪያዎች እና የአፈጻጸም አመልካቾች'}
            </p>
          </header>

          <div className="landing-page__metrics">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <article className={`landing-page__metric landing-page__metric--${stat.accent}`} key={stat.id}>
                  <div className="landing-page__metric-top">
                    <h2>{stat.label}</h2>
                    <span className="landing-page__metric-icon" aria-hidden="true"><Icon /></span>
                  </div>
                  <p className="landing-page__metric-value" aria-live="polite">
                    {stat.value === undefined
                      ? <span className="landing-page__metric-loading" aria-label={isEnglish ? 'Loading' : 'በመጫን ላይ'} />
                      : stat.value}
                  </p>
                </article>
              );
            })}
          </div>

        </div>
      </section>

      <WorkflowHierarchy />
    </div>
  );
};

export default LandingPage;
