const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken, authorizeRoles('admin', 'dept_head', 'department_head'));
const {
  createDepartment,
  getOverview,
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} = require('../controllers/departmentController');

router.get('/overview', getOverview);
router.post('/', createDepartment);
router.get('/assignments', getAssignments);
router.post('/assignments', createAssignment);
router.put('/assignments/:id', updateAssignment);
router.delete('/assignments/:id', deleteAssignment);

module.exports = router;
