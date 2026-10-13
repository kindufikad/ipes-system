const escapeTelegramHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const getDashboardUrl = () => String(
  process.env.IPES_WEB_URL || process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:3000'
).trim().replace(/\/+$/, '');

const normalizePendingItems = (pendingItems, fallback, transform = (item) => item) => {
  const items = Array.isArray(pendingItems)
    ? pendingItems.filter(Boolean)
    : String(pendingItems || '').split(' | ').map((item) => item.trim()).filter(Boolean);
  return (items.length ? items : [fallback])
    .map((item) => `- ${escapeTelegramHtml(transform(item))}`)
    .join('\n');
};

const buildStudentEvaluationReminderMessage = ({ name, pendingCount, pendingItems, targetName } = {}) => [
  '🚨 አስቸኳይ ማስታወቂያ - IPES System 🚨',
  '',
  `ሰላም ${escapeTelegramHtml(name || 'ተማሪ')}፣`,
  'የመምህራን ምዘና (Evaluation Form) ሙሉ በሙሉ ካልሞላችሁ የመጨረሻ ፈተና (Final Exam) ላይ የማትቀመጡ መሆኑን እናሳውቃለን!',
  '',
  `📌 የቀሩብዎት ምዘናዎች ብዛት: ${Number(pendingCount) || 0}`,
  '📌 የቀሩት መምህራን/ኮርሶች:',
  normalizePendingItems(pendingItems, targetName || 'የተመደበልዎት ኮርስ'),
  '',
  `እባክዎትን አሁኑኑ ወደ ሲስተሙ በመግባት ምዘናዎትን ያጠናቁ:: 🔗 ${escapeTelegramHtml(getDashboardUrl())}`,
].join('\n');

const buildInstructorPeerReminderMessage = ({ name, pendingCount, pendingItems, targetName } = {}) => {
  const items = normalizePendingItems(
    pendingItems,
    targetName || 'የተመደበልዎት የእኩዮች ምዘና',
    (item) => item.replace(/\s*-\s*Peer Evaluation$/i, '')
  );
  return [
    '🚨 አስቸኳይ ማስታወቂያ - IPES System 🚨',
    '',
    `ሰላም ${escapeTelegramHtml(name || 'መምህር')}፣`,
    'የባልደረባ ግምገማ እስካሁን አላጠናቀቁም። ግምገማውን ሙሉ በሙሉ ካላጠናቀቁ የማጠቃለያ ሪፖርት (Final Report) ማተም (Print) ፈጽሞ አይችሉም። ስለዚህ እባክዎ አሁኑኑ ወደ ሲስተሙ በመግባት የሚከተሉትን የቀሩብዎትን ምዘናዎች ያጠናቁ：',
    '',
    `📌 የቀሩብዎት ምዘናዎች ብዛት: ${Number(pendingCount) || 0}`,
    '📌 የቀሩት መምህራን (Pending Peers):',
    items,
    '',
    `እባክዎትን አሁኑኑ ወደ ሲስተሙ በመግባት ምዘናዎትን ያጠናቁ:: 🔗 ${escapeTelegramHtml(getDashboardUrl())}`,
  ].join('\n');
};

const buildEvaluationReminderMessage = ({ name, pendingCount, pendingItems, targetName } = {}) => {
  const items = Array.isArray(pendingItems)
    ? pendingItems.filter(Boolean)
    : String(pendingItems || '').split(' | ').map((item) => item.trim()).filter(Boolean);
  const itemList = (items.length ? items : [targetName || 'የተመደበልዎት ምዘና'])
    .map((item) => `• ${escapeTelegramHtml(item)}`)
    .join('\n');

  return '🚨 <b>አስቸኳይ ማስታወቂያ - IPES System</b> 🚨\n\n' +
    `ሰላም <b>${escapeTelegramHtml(name || 'Evaluator')}</b>፣\n\n` +
    'የባልደረባ/የተማሪ ግምገማ እስካሁን አላጠናቀቁም። ግምገማውን ሙሉ በሙሉ ካላጠናቀቁ <b>የማጠቃለያ ሪፖርት (Final Report) ማተም (Print) ፈጽሞ አይችሉም</b>። ስለዚህ እባክዎ አሁኑኑ ወደ ሲስተሙ በመግባት የሚከተሉትን የቀሩብዎትን ምዘናዎች ያጠናቁ：\n\n' +
    `📌 <b>የቀሩብዎት ምዘናዎች ብዛት:</b> ${Number(pendingCount) || 0}\n` +
    `📌 <b>የቀሩት መምህራን/ኮርሶች:</b>\n${itemList}\n\n` +
    'እባክዎትን አሁኑኑ ወደ ሲስተሙ በመግባት ምዘናዎትን ያጠናቁ::';
};

module.exports = {
  buildEvaluationReminderMessage,
  buildStudentEvaluationReminderMessage,
  buildInstructorPeerReminderMessage,
};