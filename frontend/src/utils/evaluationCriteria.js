export const getQuestionText = (criterion, language = 'en') => {
  if (language === 'am' && typeof criterion?.criterion_text_am === 'string' && criterion.criterion_text_am.trim()) {
    return criterion.criterion_text_am;
  }
  return criterion?.criterion_text || criterion?.text || criterion?.criterion_name || '';
};

export const groupCriteriaByCategory = (criteria = []) => criteria.reduce((sections, criterion) => {
  const category = criterion.category || 'General';
  const section = sections.find((item) => item.category === category);
  if (section) section.criteria.push(criterion);
  else sections.push({ category, criteria: [criterion] });
  return sections;
}, []);
