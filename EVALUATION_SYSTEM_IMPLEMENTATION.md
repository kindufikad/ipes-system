# IPES Evaluation System - Routing & Expiration Implementation Guide

## Implementation Complete ✅

This document outlines the comprehensive fixes implemented for the IPES (Institution Performance Evaluation System) for proper evaluation routing and 3-day form expiration logic.

---

## 1. DATABASE SCHEMA UPDATES

### New Tables Created

#### `evaluations` (Flexible Evaluation Table)
```sql
CREATE TABLE evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  evaluator_role VARCHAR(32) DEFAULT 'dept_head',
  target_user_id INT UNSIGNED NOT NULL,
  target_type VARCHAR(32) DEFAULT 'instructor',
  department_id INT UNSIGNED,
  academic_year VARCHAR(64),
  semester VARCHAR(64),
  score DECIMAL(5,2),
  criteria_scores JSON,
  strengths TEXT,
  improvements TEXT,
  comments TEXT,
  responses JSON,
  status VARCHAR(32) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_evaluation_unique (evaluator_id, target_user_id, target_type, evaluator_role, academic_year, semester)
);
```

**Purpose**: Flexible evaluation storage supporting both Instructors and Lab Assistants as evaluation targets.

#### `evaluation_forms` (Form Expiration Tracking)
```sql
CREATE TABLE evaluation_forms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  academic_year VARCHAR(64) NOT NULL,
  semester VARCHAR(64) NOT NULL,
  form_type VARCHAR(50) DEFAULT 'student',
  target_role VARCHAR(50),
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  is_published TINYINT(1) DEFAULT 1,
  created_by INT UNSIGNED,
  published_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_evaluation_form_term (department_id, academic_year, semester, form_type, target_role),
  INDEX idx_evaluation_forms_published (is_published),
  INDEX idx_evaluation_forms_expires_at (expires_at)
);
```

**Purpose**: Tracks published evaluation forms with 72-hour expiration windows.

#### `student_evaluations` (Dual-Routing for Courses)
```sql
CREATE TABLE student_evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  course_id INT UNSIGNED NOT NULL,
  target_user_id INT UNSIGNED NOT NULL,
  target_type VARCHAR(32) DEFAULT 'instructor',
  evaluator_role VARCHAR(32) DEFAULT 'student_to_instructor',
  score DECIMAL(5,2),
  feedback TEXT,
  strengths TEXT,
  improvements TEXT,
  responses JSON,
  status VARCHAR(32) DEFAULT 'submitted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_evaluation (student_id, course_id, target_user_id, target_type)
);
```

**Purpose**: Stores separate evaluations for both instructor and lab assistant on the same course.

### Schema Modifications

- **course_assignments**: Added `lab_assistant_id` field to track both instructor and lab assistant assignments
- **evaluation_dispatches**: Added `target_type` and `target_user_id` for flexible routing

---

## 2. DEPARTMENT HEAD EVALUATION SUBMISSION FIX

### Endpoint
**POST** `/api/evaluations/submit`

### Controller: `evaluationController.js`
```javascript
exports.submitDepartmentHeadEvaluation = async (req, res) => {
  const {
    evaluated_id,      // ID of target (instructor or lab assistant)
    target_type,       // 'instructor' or 'lab_assistant'
    evaluator_role,    // 'dept_head'
    academic_year,
    semester,
    score,
    criteria_scores,
    strengths,
    improvements,
    comments
  } = req.body;
```

### Key Features
1. **Flexible Target Routing**: Supports both `instructor` and `lab_assistant` as evaluation targets
2. **Proper Status Handling**: Sets status to `COMPLETED` upon successful submission
3. **Dynamic Database Mapping**: Maps `evaluated_id` to correct target based on `target_type`
4. **Notifications**: Automatically notifies the evaluated staff member

### SQL Pattern
```sql
INSERT INTO evaluations
  (evaluator_id, evaluator_role, target_user_id, target_type, department_id, 
   academic_year, semester, score, criteria_scores, strengths, improvements, comments, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
```

---

## 3. STUDENT DUAL-ROUTING FOR INSTRUCTOR & LAB ASSISTANT

### Endpoint
**POST** `/api/evaluations/submit-student`

### Controller: `evaluationController.js`
```javascript
exports.submitStudentEvaluation = async (req, res) => {
  const {
    course_id,
    assignment_id,
    score,
    feedback,
    strengths,
    improvements,
    responses
  } = req.body;
```

### Dual Routing Logic

**When a student submits course evaluation:**

1. **Fetch Assignment**: Retrieves course assignment with both `instructor_id` and `lab_assistant_id`
2. **Route 1 - Instructor**: Create/update `student_evaluations` record with:
   - `target_type = 'instructor'`
   - `evaluator_role = 'student_to_instructor'`
   - `target_user_id = instructor.user_id`

3. **Route 2 - Lab Assistant** (if assigned): Create/update `student_evaluations` record with:
   - `target_type = 'lab_assistant'`
   - `evaluator_role = 'student_to_lab_assistant'`
   - `target_user_id = lab_assistant.user_id`

### Response Example
```json
{
  "success": true,
  "message": "Course evaluation submitted to all assigned staff",
  "data": {
    "course_id": 5,
    "evaluations": [
      {"target_type": "instructor", "status": "submitted"},
      {"target_type": "lab_assistant", "status": "submitted"}
    ],
    "submitted_count": 2
  }
}
```

### Dashboard Integration

**Instructor Performance Dashboard** now includes:
- Student evaluations from `student_evaluations` table (target_type='instructor')
- Average score calculation across all student evaluations

**Lab Assistant Performance Dashboard** now includes:
- Student evaluations from `student_evaluations` table (target_type='lab_assistant')
- Department head (ARA) evaluations from `evaluations` table
- Combined performance metrics

---

## 4. 3-DAY FORM EXPIRATION LOGIC

### Endpoint: Publish Form
**POST** `/api/evaluations/publish-form`

### Request Payload
```json
{
  "department_id": 1,
  "academic_year": "2026",
  "semester": "Semester I",
  "form_type": "student",
  "target_role": "instructor"
}
```

### Automatic Expiration

**When Published:**
- `published_at = NOW()`
- `expires_at = NOW() + INTERVAL 3 DAY` (72 hours)
- `is_published = 1`

**Automatic Expiration Check:**
- Runs via middleware on every API call
- Scheduled cron job (every 30 minutes)
- Updates: `is_published = 0` where `expires_at < NOW()`

### SQL Query Pattern
```sql
SELECT * FROM evaluation_forms
WHERE is_published = 1 
  AND expires_at >= NOW()
  AND department_id = ?;
```

### Active Forms Endpoint
**GET** `/api/evaluations/active-forms`

Query Parameters:
- `department_id` (optional)
- `academic_year` (optional)
- `semester` (optional)
- `form_type` (optional)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "department_id": 1,
      "academic_year": "2026",
      "semester": "Semester I",
      "form_type": "student",
      "published_at": "2026-09-01T10:00:00Z",
      "expires_at": "2026-09-04T10:00:00Z",
      "is_published": 1
    }
  ],
  "count": 1
}
```

---

## 5. FORM EXPIRATION MIDDLEWARE

### File: `backend/middleware/formExpirationMiddleware.js`

#### Auto-Expire Middleware
```javascript
const autoExpireFormsMiddleware = async (req, res, next) => {
  // Runs on every API call
  // Updates forms where expires_at < NOW()
  // Sets is_published = 0
};
```

#### Scheduled Expiration Checker
```javascript
const initFormExpirationScheduler = () => {
  // Runs every 30 minutes
  // Ensures expired forms are marked inactive
};
```

### Implementation in Main Server
```javascript
// In backend/index.js
app.use(autoExpireFormsMiddleware);

httpServer.listen(PORT, () => {
  initFormExpirationScheduler();
  console.log('✅ Form expiration scheduler initialized');
});
```

---

## 6. API ROUTES INTEGRATION

### File: `backend/routes/evaluationRoutes.js`

All routes are registered under `/api/evaluations` prefix:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/submit` | Submit/update Department Head evaluation |
| POST | `/submit-student` | Submit student course evaluation (dual-routed) |
| GET | `/active-forms` | Get non-expired evaluation forms |
| POST | `/publish-form` | Publish form (sets 72-hour expiration) |
| GET | `/auto-expire` | Manual trigger for form auto-expiration |
| GET | `/performance` | Get combined performance scores |

### Integration in Main App
```javascript
// backend/index.js - Line ~80
const evaluationRoutes = require('./routes/evaluationRoutes');
app.use('/api/evaluations', evaluationRoutes);
```

---

## 7. DATABASE MIGRATIONS

### File: `backend/migrations/2026-09-01-flexible-evaluation-and-form-expiration.sql`

Contains:
1. New table creation statements
2. Schema modifications
3. Initial evaluation criteria seed data
4. Amharic translations for criteria

### Application
Run migration through your standard migration runner:
```bash
node backend/migrations/runMigrations.js
```

---

## 8. TESTING GUIDE

### Test Department Head Submission
```bash
curl -X POST http://localhost:5005/api/evaluations/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "evaluated_id": 1,
    "target_type": "instructor",
    "score": 25,
    "criteria_scores": {"knowledge": 5, "teaching": 4},
    "strengths": "Excellent communication",
    "improvements": "Could improve time management"
  }'
```

### Test Student Dual-Routing
```bash
curl -X POST http://localhost:5005/api/evaluations/submit-student \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": 5,
    "score": 90,
    "strengths": "Great course content",
    "improvements": "More interactive activities needed"
  }'
```

### Test Form Publication
```bash
curl -X POST http://localhost:5005/api/evaluations/publish-form \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "department_id": 1,
    "academic_year": "2026",
    "semester": "Semester I",
    "form_type": "student"
  }'
```

### Verify Form Expiration
```bash
curl -X GET "http://localhost:5005/api/evaluations/active-forms?department_id=1" \
  -H "Authorization: Bearer <token>"
```

---

## 9. KEY IMPROVEMENTS SUMMARY

✅ **Department Head Evaluation**
- Flexible targeting (Instructor & Lab Assistant)
- Proper status tracking (COMPLETED)
- Automatic notifications to evaluated staff

✅ **Student Course Evaluation**
- Automatic dual-routing to Instructor + Lab Assistant
- Separate evaluation records per target
- Included in respective dashboards

✅ **Form Expiration**
- 72-hour (3-day) visibility window
- Automatic status updates
- Periodic checks (every 30 minutes)
- Always accessible within 3-day window

✅ **Performance Aggregation**
- Combined student evaluations for instructors
- Combined evaluations for lab assistants
- Proper weighting calculations

---

## 10. MIGRATION PATH

### For Existing Deployments

1. **Backup**: Backup current database
2. **Run Migration**: Execute SQL migration file
3. **Deploy Code**: Deploy new backend code
4. **Verify**: Test evaluation submission endpoints
5. **Monitor**: Check form expiration scheduler logs

### No Data Loss
- Old evaluation data remains untouched
- New tables are created separately
- Gradual migration to new system

---

## 11. TROUBLESHOOTING

### Form Not Expiring
- Check scheduler is running: Look for "✅ Form expiration scheduler initialized" in logs
- Verify MySQL datetime: `SELECT NOW()` matches server time
- Check `evaluation_forms` table for correct `expires_at` values

### Dual-Routing Not Working
- Ensure both `instructor_id` and `lab_assistant_id` are populated in `course_assignments`
- Check `student_evaluations` table has both records created
- Verify `target_type` is correctly set to 'instructor' or 'lab_assistant'

### Department Head Submission Failing
- Verify `target_type` is 'instructor' or 'lab_assistant'
- Check target exists in correct table
- Ensure department match between evaluator and target

---

## 12. NEXT STEPS

- [ ] Test all endpoints in staging environment
- [ ] Verify form expiration across time zones
- [ ] Load test concurrent evaluation submissions
- [ ] Monitor scheduler performance
- [ ] Update frontend to use new endpoints
- [ ] Train staff on new evaluation workflow

---

**Implementation Date**: September 1, 2026  
**Status**: ✅ Complete  
**Version**: 1.0.0
