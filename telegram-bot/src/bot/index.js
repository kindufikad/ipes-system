const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN, ROLE_LABELS, BOT_URL, getDashboardUrl } = require('../config');
const {
  findUserByEmailOrId,
  findUserByPhone,
  findUserByTelegramChat,
  linkTelegramChatIfAvailable,
  clearTelegramChat,
  setUserLanguage,
  getRoleEvaluationStatus,
  getSupportContacts,
} = require('../services/userAuthService');
const { setBotInstance } = require('../services/notificationService');
const { normalizeLanguage, formatEligibilityWarning } = require('../services/localization');
const { routeMessageByTopic } = require('./topicRouter');

const pendingLinkMap = new Map();
const selectedLanguages = new Map();

const MESSAGES = {
  en: {
    login: 'Login', statusButton: 'Check Status', profileButton: 'My Profile', shareContact: 'Share Contact', cancel: 'Cancel',
    start: 'Welcome to the IPES Telegram Bot. Link your account or view your profile and evaluation status.',
    privateStart: 'Please use this bot in a private chat for secure IPES account linking.',
    privateLink: 'Please link your IPES account in a private chat.',
    loginInstruction: 'Share your Telegram contact or enter your registered University email address to link your IPES account.',
    notLinked: 'Your Telegram account is not linked. Choose Login to connect your IPES account.',
    statusSummary: '{completed}/{total} Completed, {pending} Remaining.',
    pending: 'Pending:', noPending: 'No pending course evaluations.',
    peerStatus: 'Peer evaluation status: {completed}/{total} completed, {pending} pending.',
    pendingPeers: 'Pending peers:', noPendingPeers: 'No pending peer evaluations.',
    scopeStatus: '{role} scope completion: {percentage}% ({completed}/{total} completed, {pending} pending).',
    statusError: 'Unable to load evaluation status right now. Please try again shortly.',
    profile: 'Name: {name}\nRole: {role}\nDepartment: {department}\nEmail: {email}\nID: {id}',
    logoutUnlinked: 'This Telegram account is not currently linked to IPES.',
    logoutSuccess: 'Your Telegram account has been disconnected from IPES. Use /login to link it again.',
    logoutError: 'Unable to disconnect your account right now. Please try again shortly.',
    ambiguous: 'More than one account matches that identifier. Please enter your University email instead.',
    noAccount: 'No active IPES account matched that email or phone number. Please try again.',
    roleDenied: 'This account role is not permitted to use the IPES Telegram bot.',
    accountLinkedElsewhere: 'This IPES account is already linked to another Telegram account. Contact your Department Head or System Administrator for help.',
    telegramLinkedElsewhere: 'This Telegram account is already linked to another IPES account. Contact your Department Head or System Administrator for help.',
    linkError: 'Unable to link this Telegram account. Please try again later.',
    welcome: 'Welcome {name}! Connected as {role}.',
    languagePrompt: 'Choose your preferred language:', languageSaved: 'Language preference saved as English.',
    languagePendingSave: 'Language selected for this chat. Link your IPES account to save the preference.',
    languageError: 'Unable to save your language preference right now. Please try again.',
    sharePhonePrompt: 'Share your own phone number to connect your IPES account.',
    phoneNoMatch: 'We could not match this phone number. Update it in your IPES Web Profile at http://localhost:3000/profile, then try again.',
    phoneAlreadyLinked: 'This IPES account is already connected to another Telegram account. Contact your administrator for help.',
    chatAlreadyLinked: 'This Telegram account is already connected to another IPES account. Use /logout first or contact your administrator.',
    contactWelcome: '🎉 Welcome {name}! Your account is now fully connected.',
    generalError: 'Something went wrong. Please try again shortly.',
    privateContact: 'Please share your contact in a private chat.',
    shareOwnContact: 'Please share your own Telegram contact to link your account.',
    chooseLogin: 'Choose Login first, then share your contact or enter your email.',
    helpTitle: 'IPES Telegram Bot commands:',
    help: ['/start - open the main menu', '/login - link your account', '/status - check pending evaluations', '/profile - view your profile', '/language - change your language', '/logout - disconnect your account', '/help - show commands and support contacts'],
    support: 'Contact your Department Head or System Administrator.',
    email: 'Email', phone: 'Phone', cancelLink: 'Account linking cancelled.',
    generic: 'Use /start to open the menu, /login to link your account, or /help for commands.',
    dashboard: '🌐 Go to Dashboard', peerReminder: '🔔 Reminder: You have {count} pending peer evaluations in IPES. Please complete them before the deadline!',
    roleNames: { student: 'Student', lab_assistant: 'Lab Assistant', instructor: 'Instructor', dept_head: 'Department Head', college_dean: 'College Dean', academic_director: 'Academic Director', system_admin: 'System Admin' },
  },
  am: {
    login: 'ግባ', statusButton: 'ሁኔታ ይመልከቱ', profileButton: 'የእኔ መገለጫ', shareContact: 'ኮንታክት አጋራ', cancel: 'ሰርዝ',
    start: 'እንኳን ወደ IPES ቴሌግራም ቦት በደህና መጡ። መለያዎን ያገናኙ ወይም የመገለጫዎንና የምዘና ሁኔታዎን ይመልከቱ።',
    privateStart: 'ለደህንነት የIPES መለያ ማገናኘት እባክዎ ይህን ቦት በግል ውይይት ይጠቀሙ።',
    privateLink: 'እባክዎ የIPES መለያዎን በግል ውይይት ያገናኙ።',
    loginInstruction: 'የIPES መለያዎን ለማገናኘት የቴሌግራም ኮንታክትዎን ያጋሩ ወይም የተመዘገቡበትን የዩኒቨርሲቲ ኢሜይል ያስገቡ።',
    notLinked: 'የቴሌግራም መለያዎ አልተገናኘም። የIPES መለያዎን ለማገናኘት ግባ የሚለውን ይምረጡ።',
    statusSummary: 'የምዘና ሁኔታ፦ {completed}/{total} ተጠናቋል፣ {pending} ቀርቷል።',
    pending: 'የቀሩ:', noPending: 'የቀሩ የኮርስ ምዘናዎች የሉም።',
    peerStatus: 'የእኩዮች ምዘና ሁኔታ፦ {completed}/{total} ተጠናቋል፣ {pending} ቀርቷል።',
    pendingPeers: 'የቀሩ እኩዮች:', noPendingPeers: 'የቀሩ የእኩዮች ምዘናዎች የሉም።',
    scopeStatus: '{role} ምዘና ሁኔታ፦ {percentage}% ({completed}/{total} ተጠናቋል፣ {pending} ቀርቷል)።',
    statusError: 'የምዘና ሁኔታን አሁን ማሳየት አልተቻለም። እባክዎ ቆይተው እንደገና ይሞክሩ።',
    profile: 'ስም፦ {name}\nሚና፦ {role}\nክፍል፦ {department}\nኢሜይል፦ {email}\nመለያ፦ {id}',
    logoutUnlinked: 'ይህ የቴሌግራም መለያ ከIPES ጋር አልተገናኘም።',
    logoutSuccess: 'የቴሌግራም መለያዎ ከIPES ተለያይቷል። እንደገና ለማገናኘት /login ይጠቀሙ።',
    logoutError: 'መለያዎን ማለያየት አልተቻለም። እባክዎ ቆይተው እንደገና ይሞክሩ።',
    ambiguous: 'ከአንድ በላይ መለያዎች ከዚህ መለያ ጋር ተዛምደዋል። እባክዎ የዩኒቨርሲቲ ኢሜይልዎን ያስገቡ።',
    noAccount: 'ከዚህ ኢሜይል ወይም ስልክ ጋር የሚዛመድ ንቁ የIPES መለያ አልተገኘም። እንደገና ይሞክሩ።',
    roleDenied: 'ይህ የመለያ ሚና የIPES ቴሌግራም ቦትን እንዲጠቀም አልተፈቀደለትም።',
    accountLinkedElsewhere: 'ይህ የIPES መለያ ከሌላ የቴሌግራም መለያ ጋር ተገናኝቷል። ለእርዳታ የዲፓርትመንት ኃላፊዎን ወይም የሲስተም አስተዳዳሪውን ያነጋግሩ።',
    telegramLinkedElsewhere: 'ይህ የቴሌግራም መለያ ከሌላ የIPES መለያ ጋር ተገናኝቷል። ለእርዳታ የዲፓርትመንት ኃላፊዎን ወይም የሲስተም አስተዳዳሪውን ያነጋግሩ።',
    linkError: 'የቴሌግራም መለያውን ማገናኘት አልተቻለም። እባክዎ ቆይተው እንደገና ይሞክሩ።',
    welcome: 'እንኳን ደህና መጡ {name}! እንደ {role} ተገናኝተዋል።',
    languagePrompt: 'የሚመርጡትን ቋንቋ ይምረጡ፦', languageSaved: 'የቋንቋ ምርጫዎ ወደ አማርኛ ተቀይሯል።',
    languagePendingSave: 'ቋንቋው ለዚህ ውይይት ተመርጧል። ምርጫውን ለማስቀመጥ የIPES መለያዎን ያገናኙ።',
    languageError: 'የቋንቋ ምርጫዎን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
    sharePhonePrompt: 'የIPES መለያዎን ለማገናኘት የራስዎን ስልክ ቁጥር ያጋሩ።',
    phoneNoMatch: 'ይህን ስልክ ቁጥር ማዛመድ አልተቻለም። በIPES ድረ-ገጽ መገለጫዎ http://localhost:3000/profile ላይ ያዘምኑትና እንደገና ይሞክሩ።',
    phoneAlreadyLinked: 'ይህ የIPES መለያ ከሌላ የቴሌግራም መለያ ጋር ተገናኝቷል። እባክዎ አስተዳዳሪውን ያነጋግሩ።',
    chatAlreadyLinked: 'ይህ የቴሌግራም መለያ ከሌላ የIPES መለያ ጋር ተገናኝቷል። /logout ይጠቀሙ ወይም አስተዳዳሪውን ያነጋግሩ።',
    contactWelcome: '🎉 እንኳን ደህና መጡ {name}! መለያዎ በተሳካ ሁኔታ ተገናኝቷል።',
    generalError: 'ስህተት ተፈጥሯል። እባክዎ ቆይተው እንደገና ይሞክሩ።',
    privateContact: 'እባክዎ ኮንታክትዎን በግል ውይይት ያጋሩ።',
    shareOwnContact: 'መለያዎን ለማገናኘት እባክዎ የራስዎን የቴሌግራም ኮንታክት ያጋሩ።',
    chooseLogin: 'መጀመሪያ ግባ የሚለውን ይምረጡ፣ ከዚያ ኮንታክትዎን ያጋሩ ወይም ኢሜይልዎን ያስገቡ።',
    helpTitle: 'የIPES ቴሌግራም ቦት ትእዛዞች፦',
    help: ['/start - ዋናውን ማውጫ ይክፈቱ', '/login - መለያዎን ያገናኙ', '/status - የቀሩ ምዘናዎችን ይመልከቱ', '/profile - መገለጫዎን ይመልከቱ', '/language - ቋንቋ ይቀይሩ', '/logout - መለያዎን ያላቅቁ', '/help - ትእዛዞችንና የድጋፍ መረጃን ይመልከቱ'],
    support: 'የዲፓርትመንት ኃላፊዎን ወይም የሲስተም አስተዳዳሪውን ያነጋግሩ።',
    email: 'ኢሜይል', phone: 'ስልክ', cancelLink: 'የመለያ ማገናኘት ተሰርዟል።',
    generic: '/start ለዋናው ማውጫ፣ /login መለያዎን ለማገናኘት ወይም /help ለትእዛዞች ይጠቀሙ።',
    dashboard: '🌐 አሁኑኑ ይመዝግቡ (Go to Dashboard)',
    peerReminder: '🔔 ማስታወሻ፦ በIPES {count} የእኩዮች ምዘናዎች ቀርተውዎታል። እባክዎ ከመጨረሻ ቀኑ በፊት ያጠናቁ።',
    roleNames: { student: 'ተማሪ', lab_assistant: 'የላብራቶሪ ረዳት', instructor: 'መምህር', dept_head: 'የዲፓርትመንት ኃላፊ', college_dean: 'የኮሌጅ ዲን', academic_director: 'የአካዳሚክ ዳይሬክተር', academic_vice_president: 'ምክትል ፕሬዝዳንት', system_admin: 'የሲስተም አስተዳዳሪ' },
  },
};

const t = (language, key, values = {}) => String(MESSAGES[normalizeLanguage(language)][key] || MESSAGES.am[key] || key)
  .replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const roleLabel = (language, role) => MESSAGES[normalizeLanguage(language)].roleNames[role] || ROLE_LABELS[role] || role;

const getChatLanguage = async (ctx) => {
  const chatId = String(ctx.chat?.id || '');
  if (selectedLanguages.has(chatId)) return selectedLanguages.get(chatId);
  try {
    return normalizeLanguage((await findUserByTelegramChat(chatId))?.language);
  } catch {
    return 'am';
  }
};

const buildStartKeyboard = (language) => Markup.inlineKeyboard([
  [Markup.button.callback(t(language, 'login'), 'telegram_login')],
  [Markup.button.callback('📊 Check Status', 'telegram_status')],
  [Markup.button.callback('👤 My Profile', 'telegram_profile')],
]);
const buildLanguageKeyboard = () => Markup.inlineKeyboard([
  [Markup.button.callback('🇪🇹 አማርኛ', 'telegram_language_am')],
  [Markup.button.callback('🇬🇧 English', 'telegram_language_en')],
]);
const buildContactKeyboard = () => Markup.keyboard([[
  Markup.button.contactRequest('📱 Share My Contact / ስልክ ቁጥር አጋራ'),
]]).resize().oneTime();
const buildLoginKeyboard = (language) => Markup.keyboard([
  [Markup.button.contactRequest(t(language, 'shareContact'))], [t(language, 'cancel')],
]).resize().oneTime();
const buildLinkedKeyboard = (language) => Markup.inlineKeyboard([
  [Markup.button.callback('📊 Check Status', 'telegram_status'), Markup.button.callback('👤 My Profile', 'telegram_profile')],
]);

const promptLogin = async (ctx) => {
  const language = await getChatLanguage(ctx);
  if (ctx.chat?.type !== 'private') return ctx.reply(t(language, 'privateLink'));
  pendingLinkMap.set(String(ctx.chat.id), { step: 'awaiting_identifier' });
  return ctx.reply(t(language, 'loginInstruction'), buildLoginKeyboard(language));
};

const replyWithStatus = async (ctx) => {
  const language = 'en';
  let user;
  let status;
  try {
    user = await findUserByTelegramChat(String(ctx.chat.id));
    if (!user) return ctx.reply(t(language, 'notLinked'), buildStartKeyboard(language));

    status = await getRoleEvaluationStatus(user);
  } catch (error) {
    console.error('[TELEGRAM] Evaluation status lookup failed:', error.code || error.message);
    return ctx.reply(t(language, 'statusError'));
  }

  if (user.role === 'student') {
    const pendingRows = status.rows.filter((row) => row.status === 'Pending').slice(0, 8);
    const pendingText = pendingRows.length
      ? `\n${t(language, 'pending')}\n${pendingRows.map((row) => `• ${row.course_name || row.course_code || 'Course'}${row.instructor_name ? ` - ${row.instructor_name}` : ''}`).join('\n')}`
      : `\n${t(language, 'noPending')}`;
    try {
      await ctx.reply(`${t(language, 'statusSummary', status)}${pendingText}`);
    } catch (error) {
      console.error('[TELEGRAM] Evaluation status message delivery failed:', error.message);
      return;
    }

    if (status.pending > 0) {
      const warning = formatEligibilityWarning({ language, name: user.name, pendingCount: status.pending });
      try {
        const dashboardUrl = getDashboardUrl(user.role);
        await ctx.reply(warning, {
          parse_mode: 'HTML',
          ...(dashboardUrl ? { reply_markup: { inline_keyboard: [[{ text: t(language, 'dashboard'), url: dashboardUrl }]] } } : {}),
        });
      } catch (error) {
        console.error('[TELEGRAM] Eligibility warning with dashboard button failed:', error.message);
        try {
          await ctx.reply(warning.replace(/<\/?b>/g, ''));
        } catch (fallbackError) {
          console.error('[TELEGRAM] Plain eligibility warning delivery failed:', fallbackError.message);
        }
      }
    }
    return;
  }
  if (['instructor', 'lab_assistant', 'dept_head'].includes(user.role)) {
    const pendingRows = status.rows.filter((row) => row.completion_status === 'Pending').slice(0, 8);
    const pendingText = pendingRows.length
      ? `\n${t(language, 'pendingPeers')}\n${pendingRows.map((row) => `• ${row.target_name || 'Assigned peer evaluation'}`).join('\n')}`
      : `\n${t(language, 'noPendingPeers')}`;
    try {
      return await ctx.reply(`${t(language, 'peerStatus', status)}${pendingText}`);
    } catch (error) {
      console.error('[TELEGRAM] Peer status message delivery failed:', error.message);
      return;
    }
  }
  try {
    return await ctx.reply(t(language, 'scopeStatus', { role: roleLabel(language, user.role), ...status }));
  } catch (error) {
    console.error('[TELEGRAM] Scoped status message delivery failed:', error.message);
  }
};

const replyWithProfile = async (ctx) => {
  try {
    const user = await findUserByTelegramChat(String(ctx.chat.id));
    if (!user) return ctx.reply(t('en', 'notLinked'), buildStartKeyboard('en'));
    return ctx.reply([
      '👤 User Profile Details',
      '',
      `• Full Name: ${user.name || 'N/A'}`,
      `• Role: ${ROLE_LABELS[user.role] || user.role || 'N/A'}`,
      `• Department: ${user.department_name || 'N/A'}`,
      `• Email: ${user.email || 'N/A'}`,
      `• ID: ${user.profile_id || user.email || 'N/A'}`,
    ].join('\n'));
  } catch (error) {
    console.error('[TELEGRAM] Profile query failed:', error.message);
    return ctx.reply(t('en', 'statusError'));
  }
};

const logoutAccount = async (ctx) => {
  const language = await getChatLanguage(ctx);
  try {
    const user = await findUserByTelegramChat(String(ctx.chat.id));
    if (!user) return ctx.reply(t(language, 'logoutUnlinked'), buildStartKeyboard(language));
    await clearTelegramChat(user.id);
    pendingLinkMap.delete(String(ctx.chat.id));
    return ctx.reply(t(language, 'logoutSuccess'), Markup.removeKeyboard());
  } catch (error) {
    console.error('[TELEGRAM] Logout failed:', error.message);
    return ctx.reply(t(language, 'logoutError'));
  }
};

const linkAccount = async (ctx, identifier) => {
  const chatId = String(ctx.chat.id);
  const selectedLanguage = selectedLanguages.get(chatId);
  const language = normalizeLanguage(selectedLanguage);
  const user = await findUserByEmailOrId(identifier);
  if (user?.ambiguous) return ctx.reply(t(language, 'ambiguous'));
  if (!user) return ctx.reply(t(language, 'noAccount'));
  if (!user.allowed) {
    pendingLinkMap.delete(chatId);
    return ctx.reply(t(language, 'roleDenied'));
  }
  if (user.telegram_chat_id && String(user.telegram_chat_id) !== chatId) {
    pendingLinkMap.delete(chatId);
    return ctx.reply(t(language, 'accountLinkedElsewhere'));
  }
  const existingLink = await findUserByTelegramChat(chatId);
  if (existingLink && Number(existingLink.id) !== Number(user.id)) {
    pendingLinkMap.delete(chatId);
    return ctx.reply(t(language, 'telegramLinkedElsewhere'));
  }
  const linked = await linkTelegramChatIfAvailable(user.id, chatId);
  pendingLinkMap.delete(chatId);
  if (!linked) return ctx.reply(t(language, 'linkError'));
  if (selectedLanguage) {
    await setUserLanguage(user.id, selectedLanguage);
    selectedLanguages.delete(chatId);
  }
  const preferredLanguage = normalizeLanguage(selectedLanguage || user.language);
  return ctx.reply(t(preferredLanguage, 'welcome', {
    name: user.name || 'IPES User', role: roleLabel(preferredLanguage, user.role),
  }), buildLinkedKeyboard(preferredLanguage));
};

const createBot = () => {
  if (!BOT_TOKEN) {
    console.warn('Telegram bot not initialized because BOT_TOKEN is missing.');
    return null;
  }
  const bot = new Telegraf(BOT_TOKEN);
  setBotInstance(bot);
  bot.catch(async (error, ctx) => {
    console.error(`[TELEGRAM] Error handling update ${ctx.update?.update_id}:`, error);
    try {
      const language = await getChatLanguage(ctx);
      await ctx.reply(t(language, 'generalError'));
    } catch (replyError) {
      console.error('[TELEGRAM] Could not send localized error response:', replyError.message);
    }
  });

  bot.start(async (ctx) => {
    if (ctx.chat?.type !== 'private') return ctx.reply(t('en', 'privateStart'));
    const user = await findUserByTelegramChat(String(ctx.chat.id));
    if (user) return ctx.reply(`👋 Welcome to the IPES Smart Assistance Bot!\n\n${BOT_URL}`, buildLinkedKeyboard('en'));
    return ctx.reply(`👋 Welcome to the IPES Smart Assistance Bot!\n\n${BOT_URL}\n\nShare your contact to connect your IPES account.`, buildContactKeyboard());
  });
  bot.command('login', promptLogin);
  bot.command('status', replyWithStatus);
  bot.command('profile', replyWithProfile);
  bot.command('language', async (ctx) => {
    const language = await getChatLanguage(ctx);
    return ctx.reply(t(language, 'languagePrompt'), buildLanguageKeyboard());
  });
  bot.command('logout', logoutAccount);

  bot.action('telegram_login', async (ctx) => { await ctx.answerCbQuery(); return promptLogin(ctx); });
  bot.action('telegram_status', async (ctx) => { await ctx.answerCbQuery(); return replyWithStatus(ctx); });
  bot.action('telegram_profile', async (ctx) => { await ctx.answerCbQuery(); return replyWithProfile(ctx); });
  for (const language of ['am', 'en']) {
    bot.action(`telegram_language_${language}`, async (ctx) => {
      await ctx.answerCbQuery();
      const chatId = String(ctx.chat.id);
      const user = await findUserByTelegramChat(chatId);
      if (user) {
        const saved = await setUserLanguage(user.id, language);
        if (!saved) return ctx.reply(t(language, 'languageError'));
        selectedLanguages.delete(chatId);
        return ctx.reply(t(language, 'languageSaved'), buildLinkedKeyboard(language));
      }
      selectedLanguages.set(chatId, language);
      return ctx.reply(t(language, 'languagePendingSave'), buildStartKeyboard(language));
    });
  }

  bot.help(async (ctx) => {
    const language = await getChatLanguage(ctx);
    const contacts = await getSupportContacts();
    const contactLines = [contacts.contact_email && `${t(language, 'email')}: ${contacts.contact_email}`, contacts.contact_phone && `${t(language, 'phone')}: ${contacts.contact_phone}`].filter(Boolean);
    return ctx.reply([t(language, 'helpTitle'), ...MESSAGES[language].help, `Support: ${contactLines.join(' | ') || t(language, 'support')}`].join('\n'));
  });
  bot.on('contact', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const selectedLanguage = selectedLanguages.get(chatId);
    let language = normalizeLanguage(selectedLanguage || await getChatLanguage(ctx));
    if (ctx.chat?.type !== 'private') return ctx.reply(t(language, 'privateContact'));
    const contact = ctx.message.contact;
    if (!contact.user_id || Number(contact.user_id) !== Number(ctx.from.id)) return ctx.reply(t(language, 'shareOwnContact'));

    const user = await findUserByPhone(contact.phone_number);
    if (user?.ambiguous) return ctx.reply(t(language, 'phoneNoMatch'));
    if (!user) return ctx.reply(t(language, 'phoneNoMatch'));
    language = normalizeLanguage(selectedLanguage || user.language || language);
    if (user.telegram_chat_id && String(user.telegram_chat_id) !== String(ctx.chat.id)) {
      return ctx.reply(t(language, 'phoneAlreadyLinked'));
    }
    const existingLink = await findUserByTelegramChat(chatId);
    if (existingLink && Number(existingLink.id) !== Number(user.id)) {
      return ctx.reply(t(language, 'chatAlreadyLinked'));
    }
    const linked = await linkTelegramChatIfAvailable(user.id, chatId);
    if (!linked) return ctx.reply(t(language, 'phoneAlreadyLinked'));

    if (selectedLanguage) await setUserLanguage(user.id, selectedLanguage);
    pendingLinkMap.delete(chatId);
    selectedLanguages.delete(chatId);
    await ctx.reply(t(language, 'contactWelcome', { name: user.name || 'IPES User' }), Markup.removeKeyboard());
    return ctx.reply(t(language, 'start'), buildLinkedKeyboard(language));
  });
  bot.on('text', async (ctx) => {
    const rawText = ctx.message.text || '';
    const chatId = String(ctx.chat.id);
    const language = await getChatLanguage(ctx);
    if (ctx.chat.type !== 'private') {
      const route = routeMessageByTopic(ctx.chat, ctx.message);
      return ctx.reply(language === 'en' ? `This message was routed under topic: ${route || 'general'}` : `ይህ መልዕክት በርዕስ ተመድቧል፦ ${route || 'አጠቃላይ'}`);
    }
    const text = rawText.trim();
    if (/^(?:📊\s*)?check status$/i.test(text)) return replyWithStatus(ctx);
    if (/^(?:👤\s*)?my profile$/i.test(text)) return replyWithProfile(ctx);
    if (text.toLowerCase() === 'login' || text === MESSAGES.am.login) return promptLogin(ctx);
    if (text.toLowerCase() === 'cancel' || text === MESSAGES.am.cancel) {
      pendingLinkMap.delete(chatId);
      return ctx.reply(t(language, 'cancelLink'), Markup.removeKeyboard());
    }
    if (pendingLinkMap.get(chatId)?.step === 'awaiting_identifier') return linkAccount(ctx, text);
    return ctx.reply(t(language, 'generic'));
  });

  bot.launch().catch((error) => {
    if (error.response?.error_code === 409) {
      console.error('[TELEGRAM] Another process is already polling with this bot token. Stop duplicate backend/bot processes and keep only one running.');
      return;
    }
    console.error('[TELEGRAM] Bot failed to start:', error.message);
  });
  console.log('[TELEGRAM] Bot launch requested.');
  return bot;
};

module.exports = { createBot, pendingLinkMap };