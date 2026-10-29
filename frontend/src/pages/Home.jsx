import { useContext, useEffect, useState } from 'react';
import { BarChart3, Users, Building2, TrendingUp } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import { publicApi } from '../services/api';

import ImageSlider from '../components/ImageSlider';
import WorkflowHierarchy from '../components/WorkflowHierarchy';
import './Home.css';

const Home = () => {
  const { language } = useContext(LanguageContext);
  const [systemStats, setSystemStats] = useState(null);

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
      id: 1,
      label: language === 'en' ? 'Evaluations Completed' : 'የተጠናቀቁ ግምገማዎች',
      value: systemStats?.evaluationsCompleted,
      icon: BarChart3,
      color: 'navy',
    },
    {
      id: 2,
      label: language === 'en' ? 'Active Instructors' : 'ንቁ መምህራን',
      value: systemStats?.activeInstructors,
      icon: Users,
      color: 'amber',
    },
    {
      id: 3,
      label: language === 'en' ? 'Departments' : 'ክፍሎች',
      value: systemStats?.totalDepartments,
      icon: Building2,
      color: 'blue',
    },
    {
      id: 4,
      label: language === 'en' ? 'Student Participation' : 'የተማሪ ተሳትፎ',
      value: systemStats?.studentParticipation !== undefined ? `${systemStats.studentParticipation}%` : undefined,
      icon: TrendingUp,
      color: 'amber',
    },
  ];

  return (
    <div className="landing-page">
      <section className="landing-hero" aria-label={language === 'en' ? 'University highlights' : 'የዩኒቨርሲቲ ዋና ዋና ዜናዎች'}>
        <div className="landing-container">
          <ImageSlider />
        </div>
      </section>

      <section className="landing-overview" aria-labelledby="landing-overview-title">
        <div className="landing-container landing-overview__inner">
          <header className="landing-section-heading">
            <span className="landing-section-heading__eyebrow">IPES · MEKDELA AMBA UNIVERSITY</span>
            <h2 id="landing-overview-title">
              {language === 'en' ? 'System Overview' : 'የሥርዓቱ አጠቃላይ እይታ'}
            </h2>
            <p>
              {language === 'en'
                ? 'Key metrics and performance indicators'
                : 'ቁልፍ መለኪያዎች እና የአፈጻጸም አመልካቾች'}
            </p>
          </header>

          <div className="landing-metrics">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.id}
                  className={`landing-metric-card landing-metric-card--${stat.color}`}
                >
                  <div className="landing-metric-card__top">
                    <p>{stat.label}</p>
                    <span className="landing-metric-card__icon" aria-hidden="true"><Icon /></span>
                  </div>
                  <p className="landing-metric-card__value" aria-live="polite">
                    {stat.value === undefined ? <span className="landing-metric-card__loading" aria-label="Loading" /> : stat.value}
                  </p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      <WorkflowHierarchy />
    </div>
  );
};

export default Home;