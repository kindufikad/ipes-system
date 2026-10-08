const pool = require('../config/db');
const { getLandingPageSettings } = require('../services/landingPageSettings');

const fallbackContactInfo = {
  email: 'kindufikad085@gmail.com',
  phone: '+251 961806188',
  officeHours: 'Monday-Saturday, 2:00 - 11:00',
};

const landingContentDefaults = {
  systemName: 'IPES',
  news: [],
  home_hero_images: [],
  about_page_image: null,
  system_logo: null,
  university_logo: null,
  contact: fallbackContactInfo,
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

const getLandingContent = async (_req, res) => {
  try {
    const settings = await getLandingPageSettings();
    const content = {
      ...landingContentDefaults,
      ...settings.assets,
      assets: settings.assets,
      contact: settings.contact,
      vision: settings.vision,
      mission: settings.mission,
      objectives: settings.objectives,
      announcements: settings.announcements,
      social_links: settings.social_links,
    };
    return res.status(200).json({ success: true, data: content });
  } catch (error) {
    const message = error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_TABLE_ERROR'
      ? 'Landing content is temporarily unavailable; using default content.'
      : 'Unable to load landing content.';
    console.warn(message, error?.message || error);
    return res.status(200).json({ success: true, data: landingContentDefaults, message });
  }
};

const getSystemStats = async (req, res) => {
  try {
    const [evaluationRows, instructorRows, departmentRows, participationRows] = await Promise.all([
      pool.query("SELECT COUNT(*) AS evaluationsCompleted FROM student_evaluation_submissions WHERE status = 'submitted'"),
      pool.query('SELECT COUNT(*) AS activeInstructors FROM instructors'),
      pool.query('SELECT COUNT(*) AS totalDepartments FROM departments'),
      pool.query(`
        SELECT
          COUNT(DISTINCT ses.student_id) AS participatingStudents,
          (SELECT COUNT(*) FROM students) AS totalStudents
        FROM student_evaluation_submissions ses
        WHERE ses.status = 'submitted' AND ses.student_id IS NOT NULL
      `),
    ]);

    const evaluationCount = Number(evaluationRows[0][0]?.evaluationsCompleted || 0);
    const activeInstructorCount = Number(instructorRows[0][0]?.activeInstructors || 0);
    const departmentCount = Number(departmentRows[0][0]?.totalDepartments || 0);
    const participatingStudents = Number(participationRows[0][0]?.participatingStudents || 0);
    const totalStudents = Number(participationRows[0][0]?.totalStudents || 0);
    const studentParticipation = totalStudents > 0
      ? Number(((participatingStudents / totalStudents) * 100).toFixed(2))
      : 0;

    return res.json({
      success: true,
      message: { en: 'System statistics retrieved successfully.', am: 'የሥርዓቱ ስታቲስቲክስ በተሳካ ሁኔታ ተገኝቷል።' },
      data: {
        evaluationsCompleted: evaluationCount,
        activeInstructors: activeInstructorCount,
        totalDepartments: departmentCount,
        studentParticipation,
      },
    });
  } catch (error) {
    console.error('Unable to retrieve public system statistics:', error);
    return res.status(200).json({
      success: true,
      message: { en: 'System statistics are temporarily unavailable.', am: 'የሥርዓቱ ስታቲስቲክስ ለጊዜው አይገኙም።' },
      data: {
        evaluationsCompleted: 0,
        activeInstructors: 0,
        totalDepartments: 0,
        studentParticipation: 0,
      },
    });
  }
};

const getContactInfo = async (req, res) => {
  try {
    const settings = await getLandingPageSettings();
    const contactInfo = {
      email: settings.contact.email || fallbackContactInfo.email,
      phone: settings.contact.phone || fallbackContactInfo.phone,
      officeHours: settings.contact.office_hours || fallbackContactInfo.officeHours,
    };

    return res.status(200).json({
      success: true,
      message: { en: 'Contact information retrieved successfully.', am: 'የመገናኛ መረጃ በተሳካ ሁኔታ ተገኝቷል።' },
      data: contactInfo,
    });
  } catch (error) {
    console.error('Unable to retrieve public contact information:', error);
    return res.status(200).json({
      success: true,
      message: { en: 'Contact information retrieved successfully using fallback values.', am: 'የመገናኛ መረጃ በፋልባክ ዋጋ ተገኝቷል።' },
      data: fallbackContactInfo,
    });
  }
};

module.exports = { getSystemStats, getContactInfo, getLandingContent };