const pool = require('../config/db');

const getLatestTemplate = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM evaluation_templates ORDER BY updated_at DESC LIMIT 1');
    if (!rows.length) return res.status(404).json({ message: 'No template found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('getLatestTemplate error', err.message || err);
    return res.status(500).json({ message: 'Failed to load template' });
  }
};

const createTemplate = async (req, res) => {
  try {
    const { name = 'Student Evaluation Template', template_data } = req.body;
    if (!template_data) return res.status(400).json({ message: 'template_data required' });
    const [result] = await pool.query('INSERT INTO evaluation_templates (name, template_data, created_by) VALUES (?, ?, ?)', [name, JSON.stringify(template_data), req.user ? req.user.id : null]);
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('createTemplate error', err.message || err);
    return res.status(500).json({ message: 'Failed to create template' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, template_data } = req.body;
    const [rows] = await pool.query('SELECT id FROM evaluation_templates WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Template not found' });
    const updates = [];
    const values = [];
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (template_data) {
      updates.push('template_data = ?');
      values.push(JSON.stringify(template_data));
    }
    if (!updates.length) return res.status(400).json({ message: 'No update fields provided' });
    values.push(id);
    await pool.query(`UPDATE evaluation_templates SET ${updates.join(', ')} WHERE id = ?`, values);
    return res.json({ message: 'Template updated' });
  } catch (err) {
    console.error('updateTemplate error', err.message || err);
    return res.status(500).json({ message: 'Failed to update template' });
  }
};

module.exports = { getLatestTemplate, createTemplate, updateTemplate };
