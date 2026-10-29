import { useContext } from 'react';
import {
  Building2,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  Landmark,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import './WorkflowHierarchy.css';

const roles = [
  {
    icon: GraduationCap,
    title: 'Student Evaluation',
    amharic: 'የተማሪዎች ምዘና',
    details: 'Students evaluate lecture-based instructors on teaching quality, punctuality, and course delivery.',
    contribution: '50% Weight',
    contributionAm: '50% ክብደት',
    accent: '#2563eb',
  },
  {
    icon: FlaskConical,
    title: 'Lab Assistant Evaluation',
    amharic: 'የላብራቶሪ ረዳቶች ምዘና',
    details: 'Assesses practical sessions, lab safety, equipment management, and hands-on guidance in technical courses.',
    contribution: 'Practical Sessions',
    contributionAm: 'ተግባራዊ ክፍለ ጊዜዎች',
    accent: '#0891b2',
  },
  {
    icon: Users,
    title: 'Peer Instructor Evaluation',
    amharic: 'የባልደረባ መምህራን ምዘና',
    details: 'Colleagues evaluate professional conduct, collaboration, teaching practice, and academic ethics.',
    contribution: '20% Weight',
    contributionAm: '20% ክብደት',
    accent: '#0f766e',
  },
  {
    icon: ClipboardCheck,
    title: 'Department Head Evaluation',
    amharic: 'የትምህርት ክፍል ኃላፊ ምዘና',
    details: 'Reviews department instructors on course management, research activity, and administrative responsibilities.',
    contribution: '30% Weight',
    contributionAm: '30% ክብደት',
    accent: '#d97706',
  },
  {
    icon: Building2,
    title: 'College Dean Oversight',
    amharic: 'የኮሌጅ ዲን ቁጥጥር',
    details: 'Evaluates Department Heads and oversees college-wide performance and management reports.',
    contribution: 'College Management',
    contributionAm: 'የኮሌጅ አስተዳደር',
    accent: '#16a34a',
  },
  {
    icon: Landmark,
    title: 'Academic Directorate / VP',
    amharic: 'አካዳሚክ ዳይሬክቶሬት / ምክትል ፕሬዝዳንት',
    details: 'Provides institutional oversight for directorate and non-teaching roles, with dynamic score rescaling to 100% when student evaluations do not apply.',
    contribution: 'Institutional Oversight & Non-teaching Score Rescaling',
    contributionAm: 'ተቋማዊ ቁጥጥርና የመምህርነት ያልሆነ ውጤት ማስተካከያ',
    accent: '#0284c7',
  },
  {
    icon: ShieldCheck,
    title: 'System Administrator',
    amharic: 'የስርዓት አስተዳዳሪ',
    details: 'Manages authentication, role assignments, evaluation cycles, audit logs, and data security.',
    contribution: 'System Governance',
    contributionAm: 'የስርዓት አስተዳደር',
    accent: '#be123c',
  },
];

const WorkflowHierarchy = () => {
  const { language } = useContext(LanguageContext);
  const isEnglish = language === 'en';

  return (
    <section className="workflow-hierarchy" aria-labelledby="workflow-hierarchy-title">
      <div className="workflow-hierarchy__container">
        <header className="workflow-hierarchy__heading">
          <span className="workflow-hierarchy__eyebrow">MEKDELA AMBA UNIVERSITY · IPES</span>
          <h2 id="workflow-hierarchy-title">
            {isEnglish ? 'System Workflow & Role Hierarchy' : 'የስርዓቱ የአሰራር ፍሰትና የሚና ተዋረድ'}
          </h2>
          <p lang="am">የመምህራን አፈጻጸም ምዘና ስርዓት የአሰራር ፍሰት</p>
          <span className="workflow-hierarchy__intro">
            {isEnglish
              ? 'Seven stakeholder roles work together to produce transparent, reliable performance evaluations.'
              : 'ሰባት ባለድርሻ ሚናዎች ግልጽና አስተማማኝ የአፈጻጸም ምዘና ለማቅረብ በጋራ ይሰራሉ።'}
          </span>
        </header>

        <div className="workflow-hierarchy__grid" aria-label={isEnglish ? 'Evaluation roles' : 'የምዘና ሚናዎች'}>
          {roles.map((role, index) => {
            const Icon = role.icon;
            return (
              <article
                className="hierarchy-card"
                key={role.title}
                style={{ '--card-accent': role.accent }}
              >
                <div className="hierarchy-card__topline">
                  <span className="hierarchy-card__icon" aria-hidden="true"><Icon /></span>
                  <span className="hierarchy-card__number" aria-label={`Step ${index + 1}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3>{role.title}</h3>
                <p className="hierarchy-card__amharic" lang="am">{role.amharic}</p>
                <p className="hierarchy-card__details">{role.details}</p>
                <span className="hierarchy-card__badge">
                  {isEnglish ? role.contribution : role.contributionAm}
                </span>
              </article>
            );
          })}
        </div>

      </div>
    </section>
  );
};

export default WorkflowHierarchy;