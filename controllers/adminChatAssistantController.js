const pool = require('../config/db');
const { getSystemHealthSnapshot } = require('../middleware/systemHealth');
const {
  classifyAdminChatQuestion: classifyQuestionWithAI,
  synthesizeAdminChatAnswer,
} = require('../services/aiService');

const ROLE_KEYS = ['students', 'instructors', 'labAssistants', 'departmentHeads', 'deans', 'directors'];
const ROLE_LABELS = {
  en: {
    students: 'Students',
    instructors: 'Instructors',
    labAssistants: 'Lab Assistants',
    departmentHeads: 'Department Heads',
    deans: 'Deans',
    directors: 'Directors',
  },
  am: {
    students: 'ተማሪዎች',
    instructors: 'መምህራን',
    labAssistants: 'የላብራቶሪ ረዳቶች',
    departmentHeads: 'የዲፓርትመንት ኃላፊዎች',
    deans: 'ዲኖች',
    directors: 'ዳይሬክተሮች',
  },
};

const asCount = (value) => Number(value || 0);
const makeRoleCounts = () => Object.fromEntries(ROLE_KEYS.map((key) => [key, 0]));
const queryIf = (enabled, query) => enabled ? query() : Promise.resolve([[], []]);
const normalizeEntityText = (value) => String(value || '')
  .toLocaleLowerCase()
  .replace(/\bcollage\b/g, 'college')
  .replace(/\s+/g, ' ')
  .trim();
const entityTokens = (value) => normalizeEntityText(value)
  .replace(/\b(college|of|the|department|dept)\b/g, ' ')
  .split(/[^a-z0-9]+/i)
  .filter((token) => token.length > 2);
const matchesEntity = (question, name) => {
  const normalizedName = normalizeEntityText(name);
  if (question.includes(normalizedName)) return true;
  const tokens = entityTokens(name);
  return tokens.length > 0 && tokens.every((token) => question.includes(token));
};

const SENSITIVE_COLUMN_PATTERN = /password|token|secret|credential|api.?key|private.?key|salt|code_hash|email|phone|gender|profile_picture|ip_address|telegram|student_identifier|payload|responses|feedback|strengths|weaknesses/i;
const NON_SCALAR_COLUMN_TYPES = new Set(['blob', 'json', 'mediumtext', 'longtext']);
const UNQUERYABLE_TABLES = new Set(['admin_email_verifications', 'password_resets', 'system_settings']);
const DATABASE_SCHEMA_CACHE_MS = 30_000;
let databaseSchemaCache = null;

const getAdminDatabaseSchema = async () => {
  if (databaseSchemaCache && databaseSchemaCache.expiresAt > Date.now()) return databaseSchemaCache.schema;
  const [columnRows, foreignKeys] = await Promise.all([
    pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `),
    pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `),
  ]);
  const tables = {};
  for (const row of columnRows[0]) {
    if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = { queryable: !UNQUERYABLE_TABLES.has(row.TABLE_NAME), columns: [] };
    tables[row.TABLE_NAME].columns.push({ name: row.COLUMN_NAME, type: row.DATA_TYPE });
  }
  const schema = { tables, foreignKeys: foreignKeys[0] };
  databaseSchemaCache = { schema, expiresAt: Date.now() + DATABASE_SCHEMA_CACHE_MS };
  return schema;
};

const findRelatedTable = (schema, primaryTable, relatedTable) => schema.foreignKeys.find((key) => (
  key.TABLE_NAME === primaryTable && key.REFERENCED_TABLE_NAME === relatedTable
) || (
  key.TABLE_NAME === relatedTable && key.REFERENCED_TABLE_NAME === primaryTable
));

const buildFallbackDatabasePlan = (question, schema) => {
  const text = normalizeEntityText(question);
  const tableByName = (name) => schema.tables[name]?.queryable ? name : null;
  const pendingEvaluation = /\b(pending|incomplete|not submitted)\b|የቀረ/.test(text);
  const explicitTable = Object.keys(schema.tables)
    .filter((name) => schema.tables[name].queryable)
    .sort((left, right) => right.length - left.length)
    .find((name) => text.includes(name.replace(/_/g, ' ')));
  let table = explicitTable || null;
  if (pendingEvaluation && explicitTable === 'evaluations') table = tableByName('evaluation_dispatches');
  if (table) {
    table = tableByName(table);
  } else if (/\bdepartments?\b|ዲፓርትመንት/.test(text)) table = tableByName('departments');
  else if (/\b(colleges?|collages?)\b|ኮሌጅ|ኮሌጆ/.test(text)) table = tableByName('colleges');
  else if (/\busers?\b|ተጠቃሚ/.test(text)) table = tableByName('users');
  else if (/\binstructors?\b|መምህር/.test(text)) table = tableByName('instructors');
  else if (/\bstudents?\b|ተማሪ/.test(text)) table = tableByName('students');
  else if (/\b(audit|security) logs?\b|ኦዲት መዝገብ/.test(text)) table = tableByName('audit_logs');
  else if (/\bcourses?\b/.test(text)) table = tableByName('courses');
  else if (/\b(criteria|criterion|weightings?)\b|መስፈርት|ክብደት/.test(text)) table = tableByName('evaluation_criteria');
  else if (/\bevaluations?\b|ግምገማ/.test(text)) {
    table = pendingEvaluation
      ? tableByName('evaluation_dispatches')
      : tableByName(/\b(score|result|final|average)\b/.test(text) ? 'evaluation_results' : 'evaluation_dispatches');
  } else {
    table = Object.keys(schema.tables)
      .filter((name) => schema.tables[name].queryable)
      .sort((left, right) => right.length - left.length)
      .find((name) => text.includes(name.replace(/_/g, ' ')));
  }
  if (!table) return null;
  const columns = schema.tables[table].columns;
  const filters = [];
  const statusColumn = columns.find((column) => column.name === 'status');
  const statusMatch = text.match(/\b(pending|submitted|completed|approved|published|active|inactive|closed|cancelled|failed|open)\b/);
  if (statusColumn && statusMatch) filters.push({ table, column: 'status', operator: 'equals', value: statusMatch[1] });
  const collegeFilter = text.match(/\b(?:in|under|from)\s+(.+?)\s+college\b/);
  if (table === 'departments' && collegeFilter && findRelatedTable(schema, table, 'colleges')) {
    filters.push({ table: 'colleges', column: 'name', operator: 'contains', value: collegeFilter[1].trim() });
  }
  return {
    table,
    operation: /\b(how many|count|number of|total)\b|ስንት|ብዛት/.test(text)
      ? 'count'
      : /\b(list|show|display|all|which|names)\b|ዝርዝር/.test(text) ? 'list' : 'summary',
    filters,
    limit: 20,
  };
};

const validateDatabaseQueryPlan = (rawPlan, schema) => {
  if (!rawPlan || typeof rawPlan !== 'object') return null;
  const table = String(rawPlan.table || '');
  const tableSchema = schema.tables[table];
  if (!tableSchema?.queryable) return null;
  const operation = ['list', 'count', 'summary'].includes(rawPlan.operation) ? rawPlan.operation : 'summary';
  const safeColumns = tableSchema.columns.filter((column) => (
    !SENSITIVE_COLUMN_PATTERN.test(column.name) && !NON_SCALAR_COLUMN_TYPES.has(column.type)
  ));
  if (!safeColumns.length) return null;
  const filters = Array.isArray(rawPlan.filters) ? rawPlan.filters.slice(0, 3).flatMap((filter) => {
    const filterTable = String(filter?.table || table);
    const filterSchema = schema.tables[filterTable];
    if (!filterSchema?.queryable || (filterTable !== table && !findRelatedTable(schema, table, filterTable))) return [];
    const column = filterSchema.columns.find((item) => item.name === filter?.column);
    const value = filter?.value;
    if (!column || SENSITIVE_COLUMN_PATTERN.test(column.name) || !['string', 'number', 'boolean'].includes(typeof value)) return [];
    const cleanValue = String(value).trim().slice(0, 100);
    if (!cleanValue) return [];
    return [{ table: filterTable, column: column.name, operator: ['equals', 'contains'].includes(filter.operator) ? filter.operator : 'contains', value: cleanValue }];
  }) : [];
  const requestedColumns = Array.isArray(rawPlan.columns)
    ? rawPlan.columns.filter((name) => safeColumns.some((column) => column.name === name)).slice(0, 8)
    : [];
  const selectedColumns = requestedColumns.length
    ? requestedColumns
    : safeColumns.filter((column) => !['blob', 'json', 'mediumtext', 'longtext'].includes(column.type)).slice(0, 8).map((column) => column.name);
  return { table, operation, filters, columns: selectedColumns, limit: Math.max(1, Math.min(Number(rawPlan.limit) || 20, 25)) };
};

const quoteIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const executeDatabaseQueryPlan = async (plan, schema) => {
  const tableAlias = new Map([[plan.table, 't0']]);
  const joins = [];
  for (const filter of plan.filters) {
    if (tableAlias.has(filter.table)) continue;
    const relation = findRelatedTable(schema, plan.table, filter.table);
    if (!relation) continue;
    const alias = `t${tableAlias.size}`;
    tableAlias.set(filter.table, alias);
    const condition = relation.TABLE_NAME === plan.table
      ? `${quoteIdentifier('t0')}.${quoteIdentifier(relation.COLUMN_NAME)} = ${quoteIdentifier(alias)}.${quoteIdentifier(relation.REFERENCED_COLUMN_NAME)}`
      : `${quoteIdentifier(alias)}.${quoteIdentifier(relation.COLUMN_NAME)} = ${quoteIdentifier('t0')}.${quoteIdentifier(relation.REFERENCED_COLUMN_NAME)}`;
    joins.push(`INNER JOIN ${quoteIdentifier(filter.table)} ${quoteIdentifier(alias)} ON ${condition}`);
  }
  const fromSql = `FROM ${quoteIdentifier(plan.table)} ${quoteIdentifier('t0')} ${joins.join(' ')}`;
  const parameters = [];
  const whereSql = plan.filters.length
    ? ` WHERE ${plan.filters.map((filter) => {
      const alias = tableAlias.get(filter.table);
      parameters.push(filter.operator === 'contains' ? `%${filter.value.replace(/[\\%_]/g, '\\$&')}%` : filter.value);
      return `${quoteIdentifier(alias)}.${quoteIdentifier(filter.column)} ${filter.operator === 'equals' ? '=' : 'LIKE'} ?`;
    }).join(' AND ')}`
    : '';
  const countRows = async () => {
    const [rows] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}${whereSql}`, parameters);
    return Number(rows[0]?.total || 0);
  };
  if (plan.operation === 'count') return { count: await countRows(), rows: [] };
  const selectedColumns = plan.columns.map((column) => `${quoteIdentifier('t0')}.${quoteIdentifier(column)}`).join(', ');
  const orderColumn = schema.tables[plan.table].columns.find((column) => column.name === 'created_at')
    || schema.tables[plan.table].columns.find((column) => column.name === 'id');
  const orderSql = orderColumn ? ` ORDER BY ${quoteIdentifier('t0')}.${quoteIdentifier(orderColumn.name)} DESC` : '';
  const limit = plan.operation === 'summary' ? 5 : plan.limit;
  const [rows] = await pool.query(`SELECT ${selectedColumns} ${fromSql}${whereSql}${orderSql} LIMIT ?`, [...parameters, limit]);
  return { count: await countRows(), rows };
};

const formatLocalDatabaseAnswer = ({ language, table, operation, count, rows }) => {
  const tableLabel = table.replace(/_/g, ' ');
  const samples = rows.slice(0, 5).map((row) => Object.entries(row)
    .filter(([key, value]) => !/^(id|created_at|updated_at)$/i.test(key) && value !== null && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value instanceof Date ? value.toLocaleDateString() : String(value).slice(0, 100)}`)
    .join(', '))
    .filter(Boolean)
    .join('; ');
  if (language === 'am') {
    return `በ${tableLabel} ሰንጠረዥ ${count.toLocaleString()} መዝገቦች ተገኝተዋል።${samples ? ` ናሙና: ${samples}` : ''}${operation === 'list' && count > rows.length ? ` (የመጀመሪያዎቹ ${rows.length} ተዘርዝረዋል።)` : ''}`;
  }
  return `Found ${count.toLocaleString()} ${tableLabel} record${count === 1 ? '' : 's'}.${samples ? ` Here is a sample: ${samples}.` : ''}${operation === 'list' && count > rows.length ? ` Showing the first ${rows.length}.` : ''}`;
};

const isLikelyGibberish = (question) => {
  const raw = String(question || '');
  const compact = raw.replace(/\s+/g, '');
  if (raw.length > 2000 || compact.length < 2) return true;
  if (/^(.)\1{4,}$/u.test(compact) || /([a-z]{1,2})\1{3,}/i.test(compact)) return true;
  if (/\b(?:qwerty|asdf|zxcv|hjkl|poiuy|lkjhg|mnbvc)\w*\b/i.test(raw)) return true;
  const latinWords = String(question || '').match(/[a-z]+/gi) || [];
  return latinWords.some((word) => word.length >= 6 && !/[aeiou]/i.test(word))
    || latinWords.some((word) => word.length >= 7 && /([a-z])\1{3,}/i.test(word));
};

const classifyAdminQuestion = (question) => {
  const text = String(question || '').trim();
  const language = /[\u1200-\u137f]/.test(text) ? 'am' : 'en';
  if (isLikelyGibberish(text)) return { recognized: false, language, intents: {} };

  const normalized = normalizeEntityText(text);
  const intents = {
    database: false,
    knowledge: (/\b(?:ipes|instructor performance evaluation system)\b/.test(normalized) && /\b(?:what|about|explain|meaning|stands for|stand for|who uses|purpose)\b/.test(normalized))
      || /\bwho uses (?:this )?system\b|\bwhat is (?:this )?system\b/.test(normalized)
      || (/(?:ስለ|ምንድን|አብራራ|ማን|የሚጠቀሙ)/.test(normalized) && (/\bipes\b/.test(normalized) || /ሲስተም|ስርዓት/.test(normalized))),
    hierarchy: /\b(college|collage|department|dept|student|students|instructor|instructors|lab assistant|lab assistants|department head|department heads|dept head|dean|deans|director|directors|user|users|role|roles|breakdown|registered|statistics|stats)\b|ኮሌጅ|ኮሌጆ|ዲፓርትመንት|ዲፓርትመንቶ|ተማሪ|መምህር|ላብ|ኃላፊ|ዲን|ዳይሬክተር|ብዛት|ስንት|ዝርዝር/.test(normalized),
    evaluation: /\b(evaluation|evaluations|completion|progress|submitted|pending)\b|ግምገማ|ማጠናቀቂያ|እድገት|የቀረ/.test(normalized),
    criteria: /\b(criteria|criterion|weight|weights|weighting)\b|መስፈርት|ክብደት/.test(normalized),
    system: /\b(?:system|server)\s+(?:status|health|uptime)\b|\b(server|health|uptime|memory|session|sessions|database|db status|latency)\b|ሲስተም|ስርዓት|ጤና|የስራ ጊዜ|ማህደረ ትውስታ|ክፍለ ጊዜ|ዳታቤዝ/.test(normalized),
    audit: /\b(audit|security|log|logs|login|log in|logout|log out|authentication|failed|failure|ip address|ip addresses)\b|ኦዲት|ደህንነት|መዝገብ|ግባ|ውጣ|አይፒ/.test(normalized),
  };

  return { recognized: Object.values(intents).some(Boolean), language, intents };
};

const buildDatabaseSchemaContext = (schema) => JSON.stringify({
  tables: Object.fromEntries(Object.entries(schema.tables).map(([name, table]) => [
    name,
    table.queryable
      ? table.columns.filter((column) => (
        !SENSITIVE_COLUMN_PATTERN.test(column.name) && !NON_SCALAR_COLUMN_TYPES.has(column.type)
      )).map((column) => `${column.name}:${column.type}`)
      : 'read-disabled',
  ])),
  foreignKeys: schema.foreignKeys.filter((key) => (
    schema.tables[key.TABLE_NAME]?.queryable && schema.tables[key.REFERENCED_TABLE_NAME]?.queryable
  )),
});

const resolveAdminQuestion = async (question, schema) => {
  const localAnalysis = classifyAdminQuestion(question);
  const fallbackPlan = buildFallbackDatabasePlan(question, schema);
  if (fallbackPlan) localAnalysis.intents.database = true;
  localAnalysis.recognized = localAnalysis.recognized || Boolean(fallbackPlan);
  if (isLikelyGibberish(question)) return localAnalysis;

  try {
    const aiAnalysis = await classifyQuestionWithAI({
      question,
      fallbackIntents: Object.entries(localAnalysis.intents).filter(([, enabled]) => enabled).map(([intent]) => intent),
      fallbackConfidence: localAnalysis.recognized ? 0.85 : 0.15,
      fallbackPlan,
      schemaContext: buildDatabaseSchemaContext(schema),
    });
    const confidence = Number(aiAnalysis?.confidence || 0);
    const aiIntents = aiAnalysis?.supported === true && confidence >= 0.65 && Array.isArray(aiAnalysis?.intents)
      ? aiAnalysis.intents.filter((intent) => Object.hasOwn(localAnalysis.intents, intent))
      : [];
    const databasePlan = validateDatabaseQueryPlan(aiAnalysis?.databasePlan, schema)
      || validateDatabaseQueryPlan(fallbackPlan, schema);
    const acceptedIntents = aiIntents.filter((intent) => intent !== 'database' || Boolean(databasePlan));
    const intents = Object.fromEntries(Object.keys(localAnalysis.intents).map((intent) => [intent, false]));
    acceptedIntents.forEach((intent) => { intents[intent] = true; });
    if (databasePlan) intents.database = true;
    return {
      language: localAnalysis.language,
      intents,
      databasePlan,
      recognized: acceptedIntents.length > 0 || Boolean(databasePlan),
    };
  } catch (error) {
    console.warn('Admin chatbot AI intent classification unavailable; using local intent rules.', {
      code: error?.code || 'AI_UNAVAILABLE',
    });
    return { ...localAnalysis, databasePlan: validateDatabaseQueryPlan(fallbackPlan, schema) };
  }
};

const buildClarificationMessage = (language) => language === 'am'
  ? 'ይቅርታ፣ ጥያቄዎ አልተረዳኝም። እባክዎን ስለ ተጠቃሚዎች፣ ስለ ዳታቤዝ ወይም ስለ ሲስተሙ እንቅስቃሴ ግልጽ ጥያቄ ይጠይቁ።'
  : 'Sorry, I could not understand your question. Please ask a clear question about users, the database, or system activity.';

const getActiveSessions = (req) => new Promise((resolve) => {
  const sessionStore = req.app?.get('sessionStore');
  if (typeof sessionStore?.all !== 'function') return resolve(null);
  sessionStore.all((error, sessions) => {
    if (error) return resolve(null);
    const records = Array.isArray(sessions) ? sessions : Object.values(sessions || {});
    const now = Date.now();
    resolve(records.filter((session) => {
      if (!session?.user) return false;
      const expiresAt = session.cookie?.expires ? new Date(session.cookie.expires).getTime() : null;
      return expiresAt === null || !Number.isFinite(expiresAt) || expiresAt > now;
    }).length);
  });
});

const normalizeAuditEvent = (row) => {
  const statusCode = Number(row.status_code || String(row.description || '').match(/Result:\s*(\d{3})/)?.[1] || 0);
  return {
    action: row.action_title || 'System event',
    description: row.description || '',
    user: row.performed_by || 'System',
    role: row.actor_role || 'Legacy / unknown',
    ip: row.ip_address || 'N/A',
    time: row.created_at,
    statusCode,
    status: statusCode >= 400 ? 'FAILED' : statusCode >= 200 ? 'SUCCESS' : 'UNKNOWN',
  };
};

const formatCounts = (counts, language) => ROLE_KEYS
  .map((key) => `${ROLE_LABELS[language][key]}: ${asCount(counts?.[key]).toLocaleString()}`)
  .join(' | ');

const formatDepartmentBreakdown = (department, language) => {
  const completionRate = department.evaluation?.totalRequired === undefined
    ? ''
    : ` | ${language === 'am' ? 'የግምገማ ማጠናቀቂያ' : 'Evaluation completion'} ${Number(department.evaluation.completionRate || 0).toFixed(1)}%`;
  return language === 'am'
    ? `  • ${department.name}: ${formatCounts(department.roleCounts, language)}${completionRate}`
    : `  - ${department.name}: ${formatCounts(department.roleCounts, language)}${completionRate}`;
};

const getDepartmentEvaluations = async (departmentIds) => {
  if (!departmentIds.length) return [];
  const placeholders = departmentIds.map(() => '?').join(', ');
  const [studentResult, peerResult] = await Promise.all([
    pool.query(`
      SELECT ed.department_id,
        COUNT(DISTINCT ed.id) AS required_count,
        COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed_count,
        AVG(ses.score) AS average_score
      FROM evaluation_dispatches ed
      INNER JOIN departments d ON d.id = ed.department_id
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved', 'published')
      WHERE ed.department_id IN (${placeholders})
        AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
        AND LOWER(COALESCE(ed.status, 'pending')) <> 'closed'
      GROUP BY ed.department_id
    `, departmentIds),
    pool.query(`
      SELECT evaluator.department_id,
        COUNT(DISTINCT pe.id) AS required_count,
        COUNT(DISTINCT CASE WHEN pes.id IS NOT NULL OR LOWER(COALESCE(pe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN pe.id END) AS completed_count
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      INNER JOIN departments d ON d.id = evaluator.department_id
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
      WHERE evaluator.department_id IN (${placeholders})
      GROUP BY evaluator.department_id
    `, departmentIds),
  ]);
  const studentRows = studentResult[0];
  const peerRows = peerResult[0];

  const studentByDepartment = new Map(studentRows.map((row) => [Number(row.department_id), row]));
  const peerByDepartment = new Map(peerRows.map((row) => [Number(row.department_id), row]));

  return departmentIds.map((departmentId) => {
    const studentStats = studentByDepartment.get(departmentId) || {};
    const peerStats = peerByDepartment.get(departmentId) || {};
    const totalRequired = asCount(studentStats.required_count) + asCount(peerStats.required_count);
    const totalSubmitted = asCount(studentStats.completed_count) + asCount(peerStats.completed_count);
    const completionRate = totalRequired ? Number(((totalSubmitted / totalRequired) * 100).toFixed(1)) : 0;
    return {
      departmentId,
      totalRequired,
      totalSubmitted,
      pendingCount: Math.max(totalRequired - totalSubmitted, 0),
      completionRate,
      participationRate: completionRate,
      averageScore: Number(studentStats.average_score || 0),
    };
  });
};

const buildAnswer = (question, data, intents) => {
  const text = String(question || '').trim();
  const language = /[\u1200-\u137f]/.test(text) ? 'am' : 'en';
  const normalized = normalizeEntityText(text);
  const answerParts = [];
  const allBreakdownIntent = /\ball\b|full|complete|breakdown|overview|every|all colleges|departments|ሁሉም|ሙሉ|ዝርዝር/.test(normalized);
  const asksCollege = /\bcollege\b/.test(normalized);

  if (intents.knowledge) {
    const knowledgeAnswer = language === 'am'
      ? 'IPES ማለት Instructor Performance Evaluation System (የአስተማሪ አፈጻጸም ግምገማ ስርዓት) ነው። በመክደላ አምባ ዩኒቨርሲቲ ውስጥ ግልጽ የአስተማሪ አፈጻጸም ግምገማ፣ የግብረመልስ ስብስብ፣ ትንታኔ እና የሥራ ሂደት አውቶሜሽንን የሚያግዝ ዲጂታል መድረክ ነው። ተጠቃሚዎቹ ተማሪዎች፣ መምህራን፣ የላብራቶሪ ረዳቶች፣ የዲፓርትመንት ኃላፊዎች፣ ዲኖች፣ የአካዳሚክ ዳይሬክተሮች፣ ምክትል ፕሬዚዳንቶች እና የስርዓት አስተዳዳሪዎች ናቸው።'
      : 'IPES stands for Instructor Performance Evaluation System. It is Mekdela Amba University’s digital platform for transparent instructor performance evaluations, feedback collection, analytics, and workflow automation across departments, colleges, and academic leadership. It is used by students, instructors, lab assistants, department heads, college deans, academic directors, vice presidents, and system administrators.';
    const hasLiveIntent = intents.hierarchy || intents.evaluation || intents.criteria || intents.system || intents.audit;
    if (!hasLiveIntent) return knowledgeAnswer;
    answerParts.push(knowledgeAnswer);
  }

  const department = asksCollege ? null : [...data.colleges.flatMap((item) => item.departments)]
    .sort((left, right) => entityTokens(right.name).length - entityTokens(left.name).length)
    .find((item) => matchesEntity(normalized, item.name));
  const college = [...data.colleges]
    .sort((left, right) => entityTokens(right.name).length - entityTokens(left.name).length)
    .find((item) => matchesEntity(normalized, item.name));

  if (department || college || allBreakdownIntent || intents.hierarchy) {
    if (department) {
      const evaluationLine = department.evaluation?.totalRequired === undefined
        ? ''
        : `\n${language === 'am' ? 'የግምገማ ማጠናቀቂያ' : 'Evaluation completion'}: ${Number(department.evaluation.completionRate || 0).toFixed(1)}%`;
      answerParts.push(language === 'am'
        ? `${department.collegeName} / ${department.name}\n${formatCounts(department.roleCounts, language)}${evaluationLine}`
        : `${department.collegeName} / ${department.name}\n${formatCounts(department.roleCounts, language)}${evaluationLine}`);
    } else if (college) {
      answerParts.push(language === 'am'
        ? `${college.name} | ጠቅላላ: ${formatCounts(college.roleCounts, language)}\n${college.departments.map((item) => formatDepartmentBreakdown(item, language)).join('\n') || '  የተመዘገቡ ዲፓርትመንቶች የሉም።'}`
        : `${college.name} | Total: ${formatCounts(college.roleCounts, language)}\n${college.departments.map((item) => formatDepartmentBreakdown(item, language)).join('\n') || '  No departments are registered.'}`);
    } else if (allBreakdownIntent) {
      answerParts.push(language === 'am'
        ? `ኮሌጆች: ${data.totals.colleges} | ዲፓርትመንቶች: ${data.totals.departments}\n${data.colleges.map((item) => `${item.name} | ${formatCounts(item.roleCounts, language)}\n${item.departments.map((child) => formatDepartmentBreakdown(child, language)).join('\n')}`).join('\n')}`
        : `Colleges: ${data.totals.colleges} | Departments: ${data.totals.departments}\n${data.colleges.map((item) => `${item.name} | ${formatCounts(item.roleCounts, language)}\n${item.departments.map((child) => formatDepartmentBreakdown(child, language)).join('\n')}`).join('\n')}`);
    } else {
      answerParts.push(language === 'am'
        ? `ጠቅላላ የተመዘገቡ ተጠቃሚዎች ብዛት:\n${formatCounts(data.globalRoleCounts, language)}\nኮሌጆች: ${data.totals.colleges} | ዲፓርትመንቶች: ${data.totals.departments}`
        : `System-wide role counts:\n${formatCounts(data.globalRoleCounts, language)}\nColleges: ${data.totals.colleges} | Departments: ${data.totals.departments}`);
    }
  }

  if (intents.evaluation) {
    answerParts.push(language === 'am'
      ? `የግምገማ ሂደት በዲፓርትመንት:\n${data.colleges.flatMap((item) => item.departments.map((child) => `- ${item.name} / ${child.name}: ${Number(child.evaluation?.completionRate || 0).toFixed(1)}% (${asCount(child.evaluation?.totalSubmitted)}/${asCount(child.evaluation?.totalRequired)})`)).join('\n') || 'የግምገማ መረጃ የለም።'}`
      : `Evaluation progress by department:\n${data.colleges.flatMap((item) => item.departments.map((child) => `- ${item.name} / ${child.name}: ${Number(child.evaluation?.completionRate || 0).toFixed(1)}% (${asCount(child.evaluation?.totalSubmitted)}/${asCount(child.evaluation?.totalRequired)})`)).join('\n') || 'No evaluation data is available.'}`);
  }

  if (intents.criteria) {
    answerParts.push(language === 'am'
      ? `የንቁ ግምገማ መስፈርቶች ክብደት:\n${data.criteria.map((item) => `- ${item.evaluatorType} → ${item.targetRole}: ${item.category} | ${item.textAm || item.text} (${item.weight})`).join('\n') || 'ንቁ መስፈርቶች አልተገኙም።'}`
      : `Active evaluation criteria and weightings:\n${data.criteria.map((item) => `- ${item.evaluatorType} → ${item.targetRole}: ${item.category} | ${item.text} (${item.weight})`).join('\n') || 'No active criteria were found.'}`);
  }

  if (intents.system) {
    const health = data.systemHealth;
    answerParts.push(language === 'am'
      ? `የስርዓት ሁኔታ: ${health.status}\nዳታቤዝ: ${health.database?.status || 'አይገኝም'} (${health.database?.latencyMs ?? '—'} ms)\nየስራ ጊዜ: ${health.uptime?.formatted || 'አይገኝም'}\nየማህደረ ትውስታ አጠቃቀም: ${health.memory?.usedMb ?? '—'} / ${health.memory?.totalMb ?? '—'} MB (${health.memory?.percentUsed ?? '—'}%)\nንቁ የተጠቃሚ ክፍለ ጊዜዎች: ${data.activeSessions ?? 'አይገኝም'}`
      : `System status: ${health.status}\nDatabase: ${health.database?.status || 'unavailable'} (${health.database?.latencyMs ?? '—'} ms)\nUptime: ${health.uptime?.formatted || 'unavailable'}\nMemory used: ${health.memory?.usedMb ?? '—'} / ${health.memory?.totalMb ?? '—'} MB (${health.memory?.percentUsed ?? '—'}%)\nActive user sessions: ${data.activeSessions ?? 'unavailable'}`);
  }

  if (intents.audit) {
    answerParts.push(language === 'am'
      ? `የቅርብ ጊዜ የደህንነት ኦዲት መዝገቦች:\n${data.recentAuditLogs.map((item) => `- ${item.time ? new Date(item.time).toLocaleString() : '—'} | ${item.action} | ${item.user} (${item.role}) | ${item.status} | IP ${item.ip}`).join('\n') || 'የኦዲት መዝገብ የለም።'}`
      : `Recent security audit logs:\n${data.recentAuditLogs.map((item) => `- ${item.time ? new Date(item.time).toLocaleString() : '—'} | ${item.action} | ${item.user} (${item.role}) | ${item.status} | IP ${item.ip}`).join('\n') || 'No audit records were found.'}`);
  }

  return answerParts.join('\n\n');
};

const getAdminChatAssistant = async (req, res) => {
  const question = String(req.body?.question || '').trim();
  const language = /[\u1200-\u137f]/.test(question) ? 'am' : 'en';
  if (isLikelyGibberish(question)) {
    return res.json({ success: true, data: { intent: 'clarification', answer: buildClarificationMessage(language) } });
  }

  let schema = { tables: {}, foreignKeys: [] };
  try {
    schema = await getAdminDatabaseSchema();
  } catch (error) {
    console.warn('Admin chatbot database schema lookup unavailable:', error?.code || 'SCHEMA_UNAVAILABLE');
  }
  const questionAnalysis = await resolveAdminQuestion(question, schema);
  if (!questionAnalysis.recognized) {
    return res.json({
      success: true,
      data: {
        intent: 'clarification',
        answer: buildClarificationMessage(questionAnalysis.language),
      },
    });
  }

  if (questionAnalysis.databasePlan) {
    try {
      const result = await executeDatabaseQueryPlan(questionAnalysis.databasePlan, schema);
      const safeRows = result.rows.slice(0, 10).map((row) => Object.fromEntries(Object.entries(row)
        .filter(([column]) => !SENSITIVE_COLUMN_PATTERN.test(column))
        .map(([column, value]) => [column, typeof value === 'string' ? value.slice(0, 300) : value])));
      let answer = formatLocalDatabaseAnswer({
        language: questionAnalysis.language,
        table: questionAnalysis.databasePlan.table,
        operation: questionAnalysis.databasePlan.operation,
        count: result.count,
        rows: safeRows,
      });
      try {
        const synthesis = await synthesizeAdminChatAnswer({
          question,
          language: questionAnalysis.language,
          table: questionAnalysis.databasePlan.table,
          operation: questionAnalysis.databasePlan.operation,
          filters: questionAnalysis.databasePlan.filters,
          count: result.count,
          rows: safeRows.slice(0, 5),
        });
        if (String(synthesis?.summary || '').trim()) answer = synthesis.summary.trim();
      } catch (error) {
        console.warn('Admin chatbot response synthesis unavailable; using local summary.', {
          code: error?.code || 'AI_UNAVAILABLE',
        });
      }
      if (questionAnalysis.intents.knowledge) {
        answer = `${buildAnswer(question, {}, { knowledge: true })}\n\n${answer}`;
      }
      if (questionAnalysis.intents.system) {
        try {
          const health = await getSystemHealthSnapshot();
          answer += questionAnalysis.language === 'am'
            ? `\n\nየስርዓት ሁኔታ: ${health.status}፤ ዳታቤዝ: ${health.database?.status || 'አይገኝም'}።`
            : `\n\nSystem status: ${health.status}; database: ${health.database?.status || 'unavailable'}.`;
        } catch {
          answer += questionAnalysis.language === 'am'
            ? '\n\nየስርዓት ጤና መረጃ አሁን አይገኝም።'
            : '\n\nSystem health is currently unavailable.';
        }
      }
      return res.json({
        success: true,
        data: {
          intent: Object.entries(questionAnalysis.intents).filter(([, enabled]) => enabled).map(([intent]) => intent),
          answer,
          query: {
            table: questionAnalysis.databasePlan.table,
            operation: questionAnalysis.databasePlan.operation,
            count: result.count,
            records: safeRows,
          },
        },
      });
    } catch (error) {
      console.error('Unable to execute validated admin chatbot query:', error);
      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve the requested database information.',
        data: null,
      });
    }
  }

  const hasLiveIntent = ['hierarchy', 'evaluation', 'criteria', 'system', 'audit']
    .some((intent) => questionAnalysis.intents[intent]);
  if (questionAnalysis.intents.knowledge && !hasLiveIntent) {
    return res.json({
      success: true,
      data: {
        intent: ['knowledge'],
        answer: buildAnswer(question, {}, questionAnalysis.intents),
      },
    });
  }

  try {
    const [hierarchyResult, globalRoleResult, criteriaResult, auditResult] = await Promise.all([
      queryIf(questionAnalysis.intents.hierarchy || questionAnalysis.intents.evaluation, () => pool.query(`
        SELECT c.id AS college_id, c.name AS college_name,
          d.id AS department_id, COALESCE(NULLIF(d.name, ''), d.department_name) AS department_name,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'students' THEN scoped.user_id END) AS students,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'instructors' THEN scoped.user_id END) AS instructors,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'labAssistants' THEN scoped.user_id END) AS labAssistants,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'departmentHeads' THEN scoped.user_id END) AS departmentHeads,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'deans' THEN scoped.user_id END) AS deans,
          COUNT(DISTINCT CASE WHEN scoped.role_key = 'directors' THEN scoped.user_id END) AS directors
        FROM colleges c
        LEFT JOIN departments d ON d.college_id = c.id
        LEFT JOIN (
          SELECT u.id AS user_id,
            COALESCE(s.department_id, i.department_id, la.department_id) AS department_id,
            CASE
              WHEN LOWER(u.role) = 'student' THEN 'students'
              WHEN LOWER(u.role) = 'instructor' THEN 'instructors'
              WHEN LOWER(u.role) = 'lab_assistant' THEN 'labAssistants'
              WHEN LOWER(u.role) IN ('dept_head', 'department_head') THEN 'departmentHeads'
              WHEN LOWER(u.role) IN ('college_dean', 'dean') THEN 'deans'
              WHEN LOWER(u.role) IN ('academic_directorate', 'academic_director', 'directorate', 'director') THEN 'directors'
              ELSE NULL
            END AS role_key
          FROM users u
          LEFT JOIN students s ON s.user_id = u.id
          LEFT JOIN instructors i ON i.user_id = u.id
          LEFT JOIN lab_assistants la ON la.user_id = u.id
          WHERE LOWER(u.role) IN ('student', 'instructor', 'lab_assistant', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'director')
        ) scoped ON scoped.department_id = d.id
        GROUP BY c.id, c.name, d.id, d.name, d.department_name
        ORDER BY c.name ASC, d.name ASC
      `)),
      queryIf(questionAnalysis.intents.hierarchy, () => pool.query(`
        SELECT
          COUNT(DISTINCT CASE WHEN LOWER(role) = 'student' THEN id END) AS students,
          COUNT(DISTINCT CASE WHEN LOWER(role) = 'instructor' THEN id END) AS instructors,
          COUNT(DISTINCT CASE WHEN LOWER(role) = 'lab_assistant' THEN id END) AS labAssistants,
          COUNT(DISTINCT CASE WHEN LOWER(role) IN ('dept_head', 'department_head') THEN id END) AS departmentHeads,
          COUNT(DISTINCT CASE WHEN LOWER(role) IN ('college_dean', 'dean') THEN id END) AS deans,
          COUNT(DISTINCT CASE WHEN LOWER(role) IN ('academic_directorate', 'academic_director', 'directorate', 'director') THEN id END) AS directors
        FROM users
      `)),
      queryIf(questionAnalysis.intents.criteria, () => pool.query(`
        SELECT evaluator_type, target_role, criterion_text, criterion_text_am, category, weight
        FROM evaluation_criteria
        WHERE is_active = 1
        ORDER BY evaluator_type, target_role, category, id
      `)),
      queryIf(questionAnalysis.intents.audit, () => pool.query(`
        SELECT action_title, description, performed_by, actor_role, ip_address, status_code, created_at
        FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 12
      `)),
    ]);
    const hierarchyRows = hierarchyResult[0];
    const globalRoleRows = globalRoleResult[0];
    const criteriaRows = criteriaResult[0];
    const auditRows = auditResult[0];

    const departmentRows = hierarchyRows.filter((row) => row.department_id !== null);
    const departmentIds = departmentRows.map((row) => Number(row.department_id));
    const departmentEvaluations = questionAnalysis.intents.evaluation
      ? await getDepartmentEvaluations(departmentIds)
      : [];
    const evaluationsByDepartmentId = new Map(departmentEvaluations.map((item) => [item.departmentId, item]));
    const collegesById = new Map();

    for (const row of hierarchyRows) {
      if (!collegesById.has(row.college_id)) {
        collegesById.set(row.college_id, {
          id: Number(row.college_id),
          name: row.college_name,
          roleCounts: makeRoleCounts(),
          departments: [],
        });
      }
      if (row.department_id === null) continue;
      const counts = Object.fromEntries(ROLE_KEYS.map((key) => [key, asCount(row[key])]));
      const evaluation = evaluationsByDepartmentId.get(Number(row.department_id)) || {};
      const department = {
        id: Number(row.department_id),
        name: row.department_name || 'Unnamed department',
        collegeName: row.college_name,
        roleCounts: counts,
        evaluation,
      };
      const college = collegesById.get(row.college_id);
      college.departments.push(department);
      ROLE_KEYS.forEach((key) => { college.roleCounts[key] += counts[key]; });
    }

    const colleges = [...collegesById.values()];
    const globalRoleCounts = Object.fromEntries(ROLE_KEYS.map((key) => [key, asCount(globalRoleRows[0]?.[key])]));
    const overallEvaluation = departmentEvaluations.reduce((total, item) => ({
      totalRequired: total.totalRequired + asCount(item.totalRequired),
      totalSubmitted: total.totalSubmitted + asCount(item.totalSubmitted),
    }), { totalRequired: 0, totalSubmitted: 0 });
    overallEvaluation.completionRate = overallEvaluation.totalRequired
      ? Number(((overallEvaluation.totalSubmitted / overallEvaluation.totalRequired) * 100).toFixed(1))
      : 0;

    let systemHealth = { status: 'not requested', uptime: null, memory: null };
    if (questionAnalysis.intents.system) {
      try {
        systemHealth = await getSystemHealthSnapshot();
      } catch (error) {
        console.warn('Admin chatbot could not load system health:', error?.message || error);
        systemHealth = { status: 'unavailable', uptime: null, memory: null };
      }
    }

    const data = {
      generatedAt: new Date().toISOString(),
      totals: {
        colleges: colleges.length,
        departments: colleges.reduce((total, item) => total + item.departments.length, 0),
      },
      globalRoleCounts,
      colleges,
      evaluation: overallEvaluation,
      criteria: criteriaRows.map((row) => ({
        evaluatorType: row.evaluator_type,
        targetRole: row.target_role || 'instructor',
        text: row.criterion_text,
        textAm: row.criterion_text_am || '',
        category: row.category || 'General',
        weight: asCount(row.weight),
      })),
      systemHealth,
      activeSessions: questionAnalysis.intents.system ? await getActiveSessions(req) : null,
      recentAuditLogs: auditRows.map(normalizeAuditEvent),
    };

    return res.json({
      success: true,
      data: {
        intent: Object.entries(questionAnalysis.intents).filter(([, enabled]) => enabled).map(([intent]) => intent),
        answer: buildAnswer(question, data, questionAnalysis.intents),
        snapshot: data,
      },
    });
  } catch (error) {
    console.error('Unable to generate admin chatbot response:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to generate an admin chatbot response.',
      data: null,
    });
  }
};

module.exports = {
  buildClarificationMessage,
  classifyAdminQuestion,
  getAdminChatAssistant,
};