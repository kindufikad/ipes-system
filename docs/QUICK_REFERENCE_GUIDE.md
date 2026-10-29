# QUICK REFERENCE GUIDE
## Instructor Evaluation System - Developer Quick Start

---

## 🚀 Quick Navigation

### For Testing
👉 Start here: `VERIFICATION_TEST_GUIDE.js`

### For Understanding Architecture  
👉 Read this: `IMPLEMENTATION_SUMMARY.md`

### For Deployment
👉 Check this: `FINAL_VERIFICATION_REPORT.js` (Deployment section)

### For Overview
👉 See this: `EXECUTIVE_SUMMARY.md`

---

## 📱 UI Workflow (User Perspective)

```
1. "Evaluate Instructor" Tab
   ↓
2. Click "Evaluate" Button → InstructorEvaluationCriteriaModal opens
   ↓
3. Score all 20 criteria (0-5 each)
   ↓
4. Click "Submit Evaluation"
   ↓
5. Toast notification ✓
   ↓
6. Table shows "✓ Evaluated (85.00/100)"
   ↓
7. Click "View Details" → EvaluationBreakdownModal opens
   ↓
8. Shows breakdown, click "Edit Evaluation"
   ↓
9. Back to InstructorEvaluationCriteriaModal in edit mode
   ↓
10. Modify scores and re-submit
```

---

## 💻 Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Tailwind CSS, React Icons |
| Backend | Node.js, Express |
| Database | MySQL |
| API | RESTful with JSON |
| Auth | JWT tokens |

---

## 🔌 API Quick Reference

### Submit/Update Evaluation
```javascript
POST /api/secure/dept-head/evaluations
{
  "evaluator_id": 123,
  "instructor_id": 456,
  "department_id": "dept-1",
  "criteria_scores": {
    "1": 4, "2": 5, "3": 4, ..., "20": 3
  },
  "total_score": 85
}
```

### Get All Evaluations
```javascript
GET /api/secure/dept-head/evaluations?department_id=dept-1
```

### Get Single Evaluation
```javascript
GET /api/secure/dept-head/evaluations/1
```

---

## 🎨 Component Props Quick Reference

### InstructorEvaluationCriteriaModal
```javascript
<InstructorEvaluationCriteriaModal
  open={boolean}
  onClose={() => {}}
  instructorName="John Doe"
  criteriaScores={{1: 4, 2: 5, ...}}
  setCriteriaScores={(scores) => {}}
  onSubmit={(scores, totalScore) => {}}
  isSubmitting={false}
  mode="edit"  // or "view"
/>
```

### EvaluationBreakdownModal
```javascript
<EvaluationBreakdownModal
  open={boolean}
  onClose={() => {}}
  instructorName="John Doe"
  criteriaScores={{1: 4, 2: 5, ...}}
  totalScore={85}
  onEdit={() => {}}
  submittedDate="2026-08-13T10:30:00Z"
/>
```

---

## 📊 Database Quick Reference

### Table: dept_head_evaluations

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| id | INT | Auto increment |
| evaluator_id | INT | Dept head user |
| instructor_id | INT | Target instructor |
| department_id | INT | Department |
| criteria_scores | JSON | `{1: 4, 2: 5, ...}` |
| total_score | DECIMAL | 0-100 |
| status | VARCHAR | 'Submitted' |
| created_at | TIMESTAMP | Auto |
| updated_at | TIMESTAMP | Auto |

**Unique Constraint:** (evaluator_id, instructor_id)

---

## 🧮 Score Calculation Formula

```
Average (5-point scale) = (sum of all 20 scores) / 20
Total Score (0-100) = (Average / 5) × 100

Examples:
- All 4's → 4.0 avg → 80/100
- All 5's → 5.0 avg → 100/100
- All 3's → 3.0 avg → 60/100
```

---

## 🎯 20 Criteria Overview

**Subject Matter (4)** - Teaching materials, updates, seminars, knowledge  
**Research (3)** - Community engagement, workshops, research areas  
**Professional (5)** - Student guidance, ideas, problem-solving, development, cooperation  
**Ethical (6)** - Committees, resource sharing, cordiality, teamwork, rules, discipline  
**Time Management (2)** - Department affairs, consultation hours  

---

## 🛠️ Common Development Tasks

### To Add a New Criterion
1. Update `EVALUATION_CATEGORIES` in InstructorEvaluationCriteriaModal.jsx
2. Change criteria count from 20 to 21
3. Update all validation checks
4. Test submission and calculation

### To Change Scoring Scale
1. Update `SCORE_SCALE` in modal components
2. Update score calculation formula
3. Update backend validation
4. Update performance level indicators

### To Add Email Notification
1. Create email template in backend
2. Add nodemailer configuration
3. Call email service in API endpoint
4. Add notification setting to user preferences

---

## ✅ Pre-Submission Checklist

Before submitting evaluation:
```
□ All 20 criteria scored
□ Each criterion 0-5 only
□ No blank scores
□ Ready to submit button enabled
□ No validation errors
```

---

## 🔍 Debugging Quick Tips

### No evaluation showing?
- Check database has records: `SELECT * FROM dept_head_evaluations;`
- Verify evaluator_id matches logged-in user
- Check department_id filter

### Scores not calculating?
- Verify all 20 criteria have numeric values
- Check JSON parsing: `JSON.stringify(criteriaScores)`
- Verify formula: `(avg / 5) × 100`

### Modal not opening?
- Check `open` prop is `true`
- Verify `selectedDeptInstructor` or `selectedEvaluation` is set
- Check console for errors

### API not responding?
- Verify endpoint path: `/api/secure/dept-head/evaluations`
- Check authentication token
- Verify request payload format
- Check browser Network tab

---

## 📱 Mobile Testing Shortcuts

### Device Sizes
- Mobile: 375px width
- Tablet: 768px width  
- Desktop: 1024px+ width

### Test Points
- Score buttons wrap correctly
- Modal doesn't overflow
- Text readable on small screen
- No horizontal scrolling
- Touch targets large enough (44px+)

---

## 🔐 Security Checklist

- ✓ Auth token required
- ✓ Role authorization verified
- ✓ Input validation on server
- ✓ Prepared statements used
- ✓ CORS configured
- ✓ No sensitive data in logs
- ✓ JSON properly escaped

---

## 📈 Performance Tips

1. Use collapsible sections to reduce DOM nodes
2. Lazy load category content if 20+ criteria
3. Debounce score updates
4. Cache evaluation data
5. Use React.memo for components
6. Index database queries on instructor_id

---

## 🆘 Common Issues & Solutions

### Issue: "Please score all 20 criteria"
**Solution:** Ensure all 20 criteria have values 0-5

### Issue: Scores not saving
**Solution:** Check database has dept_head_evaluations table

### Issue: Edit button not showing
**Solution:** Evaluation must have status='Submitted'

### Issue: Breakdown modal blank
**Solution:** Verify criteria_scores is properly parsed JSON

---

## 📞 Support Contacts

### For Code Issues
- Check console errors (F12)
- Review component source code
- See IMPLEMENTATION_SUMMARY.md

### For Database Issues  
- Run verification queries
- Check table schema
- Verify JSON format

### For API Issues
- Check Network tab in DevTools
- Verify request/response format
- Check backend error logs

---

## 🎓 Learning Path

1. **Start:** EXECUTIVE_SUMMARY.md (5 min read)
2. **Understand:** IMPLEMENTATION_SUMMARY.md (15 min read)
3. **Test:** VERIFICATION_TEST_GUIDE.js (20 min test)
4. **Verify:** FINAL_VERIFICATION_REPORT.js (5 min check)
5. **Deploy:** Follow deployment checklist
6. **Maintain:** Monitor error logs

---

## 📋 File Locations

```
Frontend:
  /src/components/InstructorEvaluationCriteriaModal.jsx
  /src/components/EvaluationBreakdownModal.jsx
  /src/pages/DeptHeadDashboard.jsx
  /src/services/api.js

Backend:
  /backend/routes/secureRoutes.js
  /backend/index.js (schema)

Documentation:
  /EXECUTIVE_SUMMARY.md
  /IMPLEMENTATION_SUMMARY.md
   docs/VERIFICATION_TEST_GUIDE.js
   docs/FINAL_VERIFICATION_REPORT.js
  /QUICK_REFERENCE_GUIDE.md (this file)
```

---

## 🚀 Ready to Go!

Everything is set up and ready to use. Start with the verification tests, then deploy with confidence.

**Happy evaluating! 🎓**

---

*Last Updated: 2026-08-13*
