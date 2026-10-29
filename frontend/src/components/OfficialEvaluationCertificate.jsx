import mauLogo from '../assets/mau.jpg';
import { formatCollegeName } from '../utils/formatCollegeName';
import useOfficialDocumentImages from '../hooks/useOfficialDocumentImages';

const scoreValue = (value) => Number(value || 0).toFixed(2);

const OfficialEvaluationCertificate = ({
  instructor,
  academicYear,
  semester,
  reportDate,
  referenceNumber,
  departmentName,
  collegeName: collegeNameProp,
  departmentHeadName,
}) => {
  const certificateImages = useOfficialDocumentImages();
  const row = instructor || {};
  const collegeName = formatCollegeName(collegeNameProp || row.college_name) || 'College name unavailable';
  const fullName = row.full_name || row.fullName || row.instructorName || row.name || '________________';
  const department = String(departmentName || row.department_name || row.department || '')
    .replace(/^Department of\s+/i, '').trim() || '________________';
  const studentScore = Number(row.student_score ?? row.student_average ?? row.studentScore ?? 0);
  const peerScore = Number(row.peer_score ?? row.peer_average ?? row.peerScore ?? 0);
  const deptHeadScore = Number(row.dept_head_score ?? row.deptHeadScore ?? 0);
  const finalScore = Number(row.final_score ?? row.finalScore ?? row.total_score ?? row.totalScore ?? 0);
  const year = academicYear || row.academic_year || row.academicYear || '________________';
  const term = semester || row.semester || row.term || '________________';

  const studentRaw = Math.min(Math.max(studentScore, 0), 100);
  const deptHeadRaw = Math.min(Math.max(deptHeadScore <= 30 ? (deptHeadScore / 30) * 100 : deptHeadScore, 0), 100);
  const peerRaw = Math.min(Math.max(peerScore, 0), 100);
  const calculatedTotal = (studentRaw * 0.5) + (deptHeadRaw * 0.3) + (peerRaw * 0.2);
  const displayedTotal = finalScore || calculatedTotal;

  return (
    <article className="official-report print-container official-evaluation-certificate" aria-label="Official evaluation certificate">
      <header className="official-report__header">
        <div className="official-report__english" dir="ltr">
          <h1>MEKDELA AMBA UNIVERSITY</h1>
          <p>College of Computing and Informatics</p>
          <p>Department of Computer Science</p>
        </div>
        <div className="official-report__brand-mark"><img src={mauLogo} alt="Mekdela Amba University Logo" /></div>
        <div className="official-report__amharic" dir="rtl">
          መቅደላ አምባ ዩኒቨርሲቲ<br />
          የኮምፒዩቲንግ እና ኢንፎርማቲክስ ኮሌጅ<br />
          የኮምፒዩተር ሳይንስ ዲፓርትመንት
        </div>
      </header>

      <div className="official-report__rule" />
      <div className="official-report__reference" aria-label="Certificate reference and date">
        <span>Ref. No: <strong>{referenceNumber || row.reference_number || '________________'}</strong></span>
        <span>Date: <strong>{reportDate || new Date().toLocaleDateString()}</strong></span>
      </div>

      <div className="official-evaluation-certificate__title">
        <p>OFFICIAL EVALUATION CERTIFICATE</p>
        <h2>Instructor Performance Evaluation Result</h2>
      </div>

      <div className="official-report__details">
        <p><strong>Instructor:</strong> {fullName}</p>
        <p><strong>Department:</strong> {department}</p>
        <p><strong>Academic Year:</strong> {year}</p>
        <p><strong>Semester:</strong> {term}</p>
      </div>

      <p>This is to certify that the instructor named above has completed the official performance evaluation for the stated academic period. The weighted result is recorded below.</p>

      <table className="official-report__table">
        <thead><tr><th>S/No</th><th>Evaluation Type</th><th>Weight (%)</th><th>Raw Score (%)</th><th>Weighted Contribution (%)</th></tr></thead>
        <tbody>
          <tr><td>1</td><td><strong>Evaluation by Students</strong></td><td>50%</td><td>{scoreValue(studentRaw)}%</td><td>{scoreValue(studentRaw * 0.5)}%</td></tr>
          <tr><td>2</td><td><strong>Evaluation by Department Head</strong></td><td>30%</td><td>{scoreValue(deptHeadRaw)}%</td><td>{scoreValue(deptHeadRaw * 0.3)}%</td></tr>
          <tr><td>3</td><td><strong>Evaluation by Peer Instructors</strong></td><td>20%</td><td>{scoreValue(peerRaw)}%</td><td>{scoreValue(peerRaw * 0.2)}%</td></tr>
          <tr><td colSpan="2" className="official-report__total-label">Total Score</td><td><strong>100%</strong></td><td></td><td><strong>{scoreValue(displayedTotal)}%</strong></td></tr>
        </tbody>
      </table>

      <p>Accordingly, the instructor&apos;s final weighted evaluation result is <strong>{scoreValue(displayedTotal)}%</strong>.</p>

      <div className="official-report__signature">
        <div className="official-report__signer">
          {certificateImages.signature ? <img className="official-report__signature-image" src={certificateImages.signature} alt="Department Head signature" /> : null}
          <div className="official-report__signature-line" />
          <strong>{departmentHeadName || 'Department Head'}</strong>
          <span>Department Head</span>
          <span>Date: ____________________</span>
        </div>
        <div className={`official-report__stamp${certificateImages.stamp ? ' official-report__stamp--image' : ''}`}>
          {certificateImages.stamp ? <img src={certificateImages.stamp} alt="Official university stamp" /> : <span>OFFICIAL STAMP / SEAL</span>}
        </div>
      </div>
      <div className="official-report__cc"><strong>CC:</strong><br />Department of {department}<br />{collegeName}<br />Educational Quality Assurance Directorate</div>
      <footer className="official-report__footer"><span>Department of {department}</span><span>{year} / {term}</span></footer>
    </article>
  );
};

export default OfficialEvaluationCertificate;