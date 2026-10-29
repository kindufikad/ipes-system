const normalizeLanguage = (language) => String(language || '').toLowerCase() === 'en' ? 'en' : 'am';

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatEligibilityWarning = ({ language, name, pendingCount }) => {
  const safeName = escapeHtml(name || (normalizeLanguage(language) === 'en' ? 'Student' : 'ተማሪ'));
  const count = Number(pendingCount || 0);

  if (normalizeLanguage(language) === 'en') {
    return `🚨 <b>URGENT NOTICE - IPES System</b> 🚨\n\nHello ${safeName},\nYou must complete all instructor evaluation forms to be eligible to sit for the final examination.\n\n📌 <b>Pending evaluations:</b> ${count}\n\nPlease log in to the system now and complete your evaluations.`;
  }

  return `🚨 <b>አስቸኳይ ማስታወቂያ - IPES System</b> 🚨\n\nሰላም ${safeName}፣\nየመምህራን ምዘና (Evaluation Form) ሙሉ በሙሉ ካልሞላችሁ <b>የመጨረሻ ፈተና (Final Exam)</b> ላይ የማትቀመጡ መሆኑን እናሳውቃለን!\n\n📌 <b>የቀሩብዎት ምዘናዎች:</b> ${count}\n\nእባክዎትን አሁኑኑ ወደ ሲስተሙ በመግባት ምዘናዎትን ያጠናቁ።`;
};

module.exports = { normalizeLanguage, formatEligibilityWarning };