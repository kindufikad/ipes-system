const { TOPIC_ROUTES } = require('../config');

const routeMessageByTopic = (chat, message) => {
  if (!chat || chat.type !== 'supergroup') {
    return null;
  }

  const topicId = message?.message_thread_id ?? message?.reply_to_message?.message_thread_id;
  if (topicId === undefined || topicId === null) {
    return 'general';
  }

  const routeMap = {
    [TOPIC_ROUTES.support]: 'support',
    [TOPIC_ROUTES.student]: 'student',
    [TOPIC_ROUTES.instructor]: 'instructor',
    [TOPIC_ROUTES.leadership]: 'leadership',
    [TOPIC_ROUTES.admin]: 'admin',
  };

  return routeMap[topicId] || 'general';
};

module.exports = {
  routeMessageByTopic,
};
