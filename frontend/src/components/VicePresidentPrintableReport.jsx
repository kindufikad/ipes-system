import { useTranslation } from '../context/useTranslation';
import { calculateDirectorateScore } from '../utils/directorateScoreCalculator';
import useOfficialDocumentImages from '../hooks/useOfficialDocumentImages';

const reportLabels = {
  en: {
    excellent: 'Excellent', veryGood: 'Very Good', good: 'Good', satisfactory: 'Satisfactory', needsImprovement: 'Needs Improvement',
    vicePresident: 'Vice President', academicDirectorate: 'Academic Directorate', reportAria: 'Official Academic Directorate efficiency evaluation report',
    logoAlt: 'Mekdela Amba University official logo', college: 'College of Computing and Informatics', department: 'Directorate / Department',
    university: 'Mekdela Amba University', amharicUniversity: 'መቅደላ አምባ ዩኒቨርሲቲ', amharicCollege: 'የኮምፒውቲንግ እና ኢንፎርማቲክስ ኮሌጅ', amharicDepartment: 'ዳይሬክቶሬት / ዲፓርትመንት',
    reference: 'Ref. No:', date: 'Date:', subject: 'Subject: To notify {year} semester {semester} efficiency evaluation result', to: 'To:',
    candidateName: 'Candidate Name:', directorate: 'Directorate:', candidateId: 'Candidate ID:', academicPeriod: 'Academic Period:',
    body: 'This letter officially notifies the Academic Directorate of the performance evaluation result for the academic period stated above. The evaluation summary and final weighted result are recorded below for your information and official action.',
    serial: 'S/No', evaluationType: 'Evaluation Type', weight: 'Weight (%)', rawScore: 'Raw Score (%)', weightedContribution: 'Weighted Contribution (%)',
    students: 'Evaluation by Students', vicePresidentEvaluation: 'Evaluation by Vice President', peers: 'Evaluation by Peer Instructors', totalWeight: 'Total Evaluation Weight',
    finalRescaled: 'Final Re-scaled Score (100% Equivalent)',
    finalGrade: 'Final Grade Classification:', pending: 'Pending', rescaled: ' - Re-scaled to 100% for Non-Teaching Role',
    issuedBy: 'Issued By (Vice President)', signatureDate: 'Signature & Date', signature: 'Signature', officialStampTop: 'OFFICIAL', officialStampBottom: 'STAMP / SEAL',
    copyTo: 'Copy To (CC):', qualityAssurance: 'Quality Assurance Directorate', humanResources: 'Human Resources Directorate', semester: 'Semester',
  },
  am: {
    excellent: 'እጅግ በጣም ጥሩ', veryGood: 'በጣም ጥሩ', good: 'ጥሩ', satisfactory: 'አጥጋቢ', needsImprovement: 'ማሻሻያ ያስፈልጋል',
    vicePresident: 'ምክትል ፕሬዝዳንት', academicDirectorate: 'የአካዳሚክ ዳይሬክቶሬት', reportAria: 'የአካዳሚክ ዳይሬክቶሬት ይፋዊ የአፈጻጸም ግምገማ ሪፖርት',
    logoAlt: 'የመቅደላ አምባ ዩኒቨርሲቲ ኦፊሴላዊ አርማ', college: 'የኮምፒውቲንግ እና ኢንፎርማቲክስ ኮሌጅ', department: 'ዳይሬክቶሬት / ትምህርት ክፍል',
    university: 'መቅደላ አምባ ዩኒቨርሲቲ', amharicUniversity: 'መቅደላ አምባ ዩኒቨርሲቲ', amharicCollege: 'የኮምፒውቲንግ እና ኢንፎርማቲክስ ኮሌጅ', amharicDepartment: 'ዳይሬክቶሬት / ዲፓርትመንት',
    reference: 'የማጣቀሻ ቁጥር:', date: 'ቀን:', subject: 'ርዕስ፡ የ{year} ሴሚስተር {semester} የውጤታማነት ግምገማ ውጤት ለማሳወቅ', to: 'ለ:',
    candidateName: 'የእጩ ስም:', directorate: 'ዳይሬክቶሬት:', candidateId: 'የእጩ መለያ:', academicPeriod: 'የትምህርት ጊዜ:',
    body: 'ይህ ደብዳቤ ከዚህ በላይ በተጠቀሰው የትምህርት ጊዜ የአካዳሚክ ዳይሬክቶሬትን የአፈጻጸም ግምገማ ውጤት በይፋ ያሳውቃል። የግምገማው ማጠቃለያ እና የመጨረሻ ሚዛናዊ ውጤት ለመረጃዎ እና ለኦፊሴላዊ እርምጃ ከታች ተመዝግቧል።',
    serial: 'ተ.ቁ', evaluationType: 'የግምገማ ዓይነት', weight: 'ክብደት (%)', rawScore: 'ጥሬ ውጤት (%)', weightedContribution: 'ሚዛናዊ አስተዋጽኦ (%)',
    students: 'የተማሪዎች ግምገማ', vicePresidentEvaluation: 'የምክትል ፕሬዝዳንት ግምገማ', peers: 'የመምህራን ባልደረባ ግምገማ', totalWeight: 'ጠቅላላ የግምገማ ክብደት',
    finalRescaled: 'የመጨረሻ ወደ 100% የተመጣጠነ ውጤት',
    finalGrade: 'የመጨረሻ ደረጃ ምደባ:', pending: 'በመጠባበቅ ላይ', rescaled: ' - ለማስተማር ላልሆነ ሚና ወደ 100% እንደገና ተመጣጥኗል',
    issuedBy: 'ያወጣው (ምክትል ፕሬዝዳንት)', signatureDate: 'ፊርማ እና ቀን', signature: 'ፊርማ', officialStampTop: 'ኦፊሴላዊ', officialStampBottom: 'ማህተም',
    copyTo: 'ግልባጭ ለ:', qualityAssurance: 'የጥራት ማረጋገጫ ዳይሬክቶሬት', humanResources: 'የሰው ሀብት ዳይሬክቶሬት', semester: 'ሴሚስተር',
  },
};

const gradeClassification = (score, labels) => {
  if (score >= 85) return labels.excellent;
  if (score >= 70) return labels.veryGood;
  if (score >= 60) return labels.good;
  if (score >= 50) return labels.satisfactory;
  return labels.needsImprovement;
};

const formatScore = (value) => Number(value || 0).toFixed(2);

const AcademicDirectorateReportPrint = ({ report, logoUrl, vicePresidentName, vicePresidentEmail }) => {
  const officialMarks = useOfficialDocumentImages();
  const { language } = useTranslation();
  const copy = reportLabels[language] || reportLabels.en;
  const director = report?.director || {};
  const normalizedEmail = String(vicePresidentEmail || '').trim();
  const suppliedSignerName = String(vicePresidentName || '').trim();
  const signerName = suppliedSignerName && !suppliedSignerName.includes('@')
    && suppliedSignerName.toLowerCase() !== normalizedEmail.toLowerCase()
    ? suppliedSignerName
    : copy.vicePresident;
  const components = report?.components || {};
  const student = components.student || {};
  const studentEvaluationExists = !student.isNA && student.rawScore != null;
  const academicYear = report?.academicPeriod?.academicYear || '2026 E.C';
  const year = /E\.C/i.test(academicYear) ? academicYear : `${academicYear} E.C`;
  const semester = String(report?.academicPeriod?.semester || 'I').replace(/^semester\s*/i, '').trim();
  const calculatedScore = calculateDirectorateScore({
    peerRaw: components.peer?.rawScore,
    vicePresidentRaw: components.vicePresident?.rawScore,
    studentRaw: student.rawScore,
    studentApplicable: studentEvaluationExists,
  });
  const rows = [
    ...(studentEvaluationExists ? [{ label: copy.students, component: student, weight: 50, weighted: calculatedScore.studentWeighted }] : []),
    {
      label: copy.vicePresidentEvaluation,
      component: components.vicePresident || {},
      weight: 30,
      weighted: calculatedScore.vicePresidentWeighted,
    },
    {
      label: copy.peers,
      component: components.peer || {},
      weight: 20,
      weighted: calculatedScore.peerWeighted,
    },
  ];
  const totalWeight = calculatedScore.totalWeight;
  const weightedSubtotal = calculatedScore.weightedSubtotal;
  const finalScore = report?.totalScore == null ? null : calculatedScore.totalScore;
  const reportDate = new Date().toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US');
  const referenceNumber = `MAU/AD/VP/${report?.evaluationId || director.userId || 'REPORT'}/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  return (
    <div id="printable-academic-report" className="vice-president-report-shell academic-directorate-report-print-shell" aria-hidden="true">
      <article className="vice-president-report" aria-label={copy.reportAria}>
        <header className="vice-president-report__header">
          <div className="vice-president-report__university vice-president-report__university--english">
            <h1>{copy.university}</h1>
            <p>{copy.college}</p>
            <p>{copy.department}: {director.department || copy.academicDirectorate}</p>
          </div>
          <img src={logoUrl} alt={copy.logoAlt} className="vice-president-report__crest" />
          <div className="vice-president-report__university vice-president-report__university--amharic" lang="am">
            <h1>{copy.amharicUniversity}</h1>
            <p>{copy.amharicCollege}</p>
            <p>{copy.amharicDepartment}: {director.department || copy.academicDirectorate}</p>
          </div>
        </header>

        <div className="vice-president-report__rule" />
        <div className="vice-president-report__reference">
          <span>{copy.reference} {referenceNumber}</span>
          <span>{copy.date} {reportDate} / {year}</span>
        </div>

        <h2 className="vice-president-report__subject">{copy.subject.replace('{year}', year).replace('{semester}', semester)}</h2>
        <p className="vice-president-report__recipient"><strong>{copy.to}</strong> {director.name || copy.academicDirectorate}</p>
        <section className="vice-president-report__candidate">
          <p><strong>{copy.candidateName}</strong> {director.name || copy.academicDirectorate}</p>
          <p><strong>{copy.directorate}</strong> {director.department || copy.academicDirectorate}</p>
          <p><strong>{copy.candidateId}</strong> {director.employeeId || director.userId || director.id || '—'}</p>
          <p><strong>{copy.academicPeriod}</strong> {year} / {copy.semester} {semester}</p>
        </section>

        <p className="vice-president-report__body">
          {copy.body}
        </p>

        <table className="vice-president-report__table">
          <thead><tr><th>{copy.serial}</th><th>{copy.evaluationType}</th><th>{copy.weight}</th><th>{copy.rawScore}</th><th>{copy.weightedContribution}</th></tr></thead>
          <tbody>
            {rows.map(({ label, component, weight, weighted }, index) => (
              <tr key={label}>
                <td>{index + 1}</td>
                <td>{label}</td>
                <td>{weight}%</td>
                <td>{component.rawScore == null ? 'N/A' : `${formatScore(component.rawScore)}%`}</td>
                <td>{component.rawScore == null ? 'N/A' : `${formatScore(weighted)}%`}</td>
              </tr>
            ))}
            <tr className="vice-president-report__subtotal">
              <td colSpan="2">{copy.totalWeight}</td>
              <td>{totalWeight}%</td>
              <td></td>
              <td>{formatScore(weightedSubtotal)}%</td>
            </tr>
            <tr className="vice-president-report__final-total">
              <td colSpan="2">{copy.finalRescaled}</td>
              <td>100%</td>
              <td></td>
              <td>{finalScore == null ? copy.pending : `${formatScore(finalScore)}%`}</td>
            </tr>
          </tbody>
        </table>

        <p className="vice-president-report__final-result">
          <strong>{copy.finalGrade}</strong>{' '}
          {finalScore == null ? copy.pending : `${gradeClassification(Number(finalScore), copy)} (${formatScore(finalScore)}%${studentEvaluationExists ? '' : copy.rescaled})`}
        </p>

        <footer className="vice-president-report__footer">
          <div className="vice-president-report__signature">
            <strong>{copy.issuedBy}</strong>
            <span>{signerName}</span>
            {normalizedEmail ? <span>{normalizedEmail}</span> : null}
            {officialMarks.signature ? <img className="vice-president-report__signature-image" src={officialMarks.signature} alt={copy.signature} /> : null}
            <div className="vice-president-report__line" />
            <span>{copy.signature}</span>
            <span>Date: ____________________</span>
          </div>
          <div className={`vice-president-report__seal${officialMarks.stamp ? ' vice-president-report__seal--image' : ''}`}>
            {officialMarks.stamp ? <img src={officialMarks.stamp} alt={`${copy.officialStampTop} ${copy.officialStampBottom}`} /> : <span>{copy.officialStampTop}<br />{copy.officialStampBottom}</span>}
          </div>
        </footer>
        <p className="vice-president-report__cc"><strong>{copy.copyTo}</strong> {copy.department} {director.department || copy.academicDirectorate}; {copy.qualityAssurance}; {copy.humanResources}.</p>
      </article>
    </div>
  );
};

export default AcademicDirectorateReportPrint;