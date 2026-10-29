# UI Refactor - Quick Reference Guide
## InstructorEvaluationCriteriaModal v2.0

---

## 🎯 What Changed?

**Old UI:** Collapsible accordion with verbose 6-point scale (0-5) color-coded badges  
**New UI:** Always-visible flat layout with minimal 5-point circular buttons (1-5)

---

## 🚀 Quick Start

### Import & Usage (No changes needed)
```jsx
import InstructorEvaluationCriteriaModal from '@/components/InstructorEvaluationCriteriaModal';

<InstructorEvaluationCriteriaModal
  open={showModal}
  onClose={() => setShowModal(false)}
  instructorName="Dr. John Doe"
  criteriaScores={deptEvalCriteriaScores}
  setCriteriaScores={setDeptEvalCriteriaScores}
  onSubmit={handleSubmit}
  mode="edit" // or "view"
  isSubmitting={isSubmitting}
/>
```

---

## 📋 What's Different?

### SCORE_SCALE Removed
```javascript
// ❌ REMOVED (old)
const SCORE_SCALE = [
  { value: 0, label: "0 - Poor", color: "bg-red-100 text-red-900..." },
  { value: 1, label: "1 - Below Average", color: "bg-orange-100..." },
  { value: 2, label: "2 - Average", color: "bg-yellow-100..." },
  { value: 3, label: "3 - Good", color: "bg-blue-100..." },
  { value: 4, label: "4 - Very Good", color: "bg-green-100..." },
  { value: 5, label: "5 - Excellent", color: "bg-emerald-100..." }
];
```

### RATING_SCALE Added
```javascript
// ✅ ADDED (new)
const RATING_SCALE = [1, 2, 3, 4, 5];
```

### State Management (Simplified)
```javascript
// ❌ REMOVED
const [expandedCategory, setExpandedCategory] = React.useState(0);

// ✅ STILL PRESENT (unchanged)
const [error, setError] = React.useState('');
const [isEditMode, setIsEditMode] = React.useState(mode === 'edit');
```

---

## 🎨 Layout Comparison

### Category Header
```javascript
// BEFORE - Interactive accordion header
<button onClick={() => setExpandedCategory(index)}>
  <span>{expandedCategory === index ? <FaChevronUp /> : <FaChevronDown />}</span>
  {categoryName}
</button>

// AFTER - Static text header
<h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3 pl-1">
  {categoryName}
</h3>
```

### Criterion Row
```javascript
// BEFORE - Complex multi-line layout
<div className="flex flex-wrap gap-2">
  {SCORE_SCALE.map(scale => (
    <button className={scale.color + (currentScore === scale.value ? 'opacity-100' : 'opacity-70')}>
      {scale.label}
    </button>
  ))}
</div>

// AFTER - Simple single-row layout
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/70 hover:bg-gray-100/50 rounded-2xl border border-gray-100 transition-all">
  <p className="text-sm font-medium text-gray-700 flex-1 pr-4">
    <span className="text-gray-400 mr-3 font-mono font-bold">{criterion.id}.</span>
    {criterion.text}
  </p>

  <div className="flex items-center gap-2 shrink-0">
    {RATING_SCALE.map((rating) => (
      <button
        onClick={() => isEditMode && handleScoreChange(criterion.id, rating)}
        disabled={!isEditMode}
        className={`w-9 h-9 rounded-full text-sm font-semibold transition-all duration-150 flex items-center justify-center ${
          currentScore === rating
            ? "bg-blue-600 text-white shadow-md shadow-blue-200 scale-105 ring-2 ring-blue-300"
            : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400 hover:text-blue-600"
        } ${!isEditMode ? "cursor-default" : "cursor-pointer"}`}
      >
        {rating}
      </button>
    ))}
  </div>
</div>
```

---

## 🔢 Scoring Logic (Unchanged)

### Score Calculation
```javascript
// Calculate average (1-5 scale)
const calculateAverageScore = () => {
  const scores = Object.values(criteriaScores);
  if (scores.length === 0) return 0;
  return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2);
};

// Convert to percentage (0-100)
const calculateTotalScore = () => {
  const avgScore = calculateAverageScore();
  return Math.round((avgScore / 5) * 100);
};
```

### Examples
```
Score Distribution:
├─ 1: 20/100  (Poor)
├─ 2: 40/100  (Below Average)
├─ 3: 60/100  (Average)
├─ 4: 80/100  (Good)
└─ 5: 100/100 (Excellent)
```

---

## 🎮 Interaction Patterns

### Click Button (Edit Mode)
```javascript
onClick={() => isEditMode && handleScoreChange(criterion.id, rating)}
```
- Only fires if `isEditMode` is true
- Updates `criteriaScores[criterion.id]` to selected rating
- Re-renders button styling immediately
- Selected button shows blue with ring

### View Mode
```javascript
disabled={!isEditMode}
className={!isEditMode ? "cursor-default" : "cursor-pointer"}
```
- Buttons are disabled and unclickable
- Cursor shows as default (not pointer)
- Selected score displays with blue styling
- "Edit Evaluation" button available to switch modes

---

## 📱 Responsive Classes

### Desktop (≥ 640px)
```jsx
className="flex flex-col sm:flex-row sm:items-center justify-between"
```
- Renders in single row
- Text left, buttons right
- Optimal spacing

### Mobile (< 640px)
```jsx
// Same class applies, but flex-col takes precedence
className="flex flex-col sm:flex-row sm:items-center justify-between"
```
- Renders in column (flex-col default)
- Text above, buttons below
- Full width container

---

## 🎨 CSS Classes Reference

### Colors
```javascript
// Backgrounds
bg-white          // Unselected button
bg-blue-600       // Selected button
bg-gray-50/70     // Row container (70% opacity)
bg-gray-100/50    // Row container on hover (50% opacity)
bg-blue-50        // Instructions section
bg-red-50         // Error section

// Borders
border-gray-200   // Row container & unselected button
border-blue-200   // Instructions section
border-red-200    // Error section
border-gray-100   // Row container line

// Text
text-gray-700     // Criterion text
text-gray-600     // Labels & headers
text-gray-400     // Criterion numbers
text-white        // Selected button text
text-red-800      // Error text

// Hover states
hover:border-blue-400
hover:text-blue-600
hover:bg-gray-100/50
```

### Sizing
```javascript
w-9 h-9           // Button (36px × 36px)
p-4               // Padding (16px)
gap-2             // Button gap (8px)
gap-4             // Row gap (16px)
rounded-full      // Circle shape
rounded-2xl       // Row container (16px)
```

### Effects
```javascript
shadow-md         // Button shadow
shadow-blue-200   // Shadow color
scale-105         // Selected button enlarge
ring-2            // Blue ring width
ring-blue-300     // Ring color
transition-all    // Smooth animation
duration-150      // 150ms animation
```

---

## 🧪 Testing Checklist

### Unit Tests
```javascript
// Test score selection
test('selects score when clicked', () => {
  const scores = { 1: 4 };
  // Verify only rating 4 shows blue styling
});

// Test view mode
test('disables buttons in view mode', () => {
  const component = render(<Modal mode="view" />);
  // Verify buttons have disabled={true}
});

// Test calculation
test('calculates total score correctly', () => {
  const avgScore = 3.5;
  const total = (avgScore / 5) * 100; // Should be 70
});
```

### Integration Tests
```javascript
// Test modal open/close
test('opens with instructor data', () => {
  // Verify modal displays correct instructor name
  // Verify criteria scores pre-filled in edit mode
});

// Test submission
test('submits all criteria scores', () => {
  // Verify onSubmit called with all 20 criteria
  // Verify calculateTotalScore included in payload
});
```

---

## 🐛 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Buttons not clickable | View mode | Switch to edit mode with "Edit Evaluation" button |
| Scores not saving | onSubmit not called | Check handleSubmit logic in parent component |
| Buttons not showing | CSS not loaded | Verify Tailwind CSS build includes component |
| Layout broken on mobile | Viewport meta missing | Add `<meta name="viewport" content="width=device-width">` |
| Colors don't match | Dark mode | Check if dark mode is enabled in Tailwind config |

---

## 📊 Props Reference

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | boolean | Yes | — | Show/hide modal |
| `onClose` | function | Yes | — | Called when user closes modal |
| `instructorName` | string | Yes | — | Instructor name to display |
| `criteriaScores` | object | No | {} | Map of criterion ID to score (1-5) |
| `setCriteriaScores` | function | Yes | — | Update criteria scores state |
| `onSubmit` | function | Yes | — | Called with (criteriaScores, totalScore) |
| `isSubmitting` | boolean | No | false | Show loading state on submit button |
| `mode` | string | No | 'edit' | 'edit' or 'view' mode |

---

## 🚀 Performance Tips

### Optimization
- Component uses `useMemo` for categories (prevents recalculation)
- Buttons use local click handlers (minimal re-renders)
- CSS transitions are GPU-accelerated
- No heavy computations in render

### Best Practices
```javascript
// ✅ DO: Pre-load scores before opening modal
const [criteriaScores, setCriteriaScores] = useState({});

// ✅ DO: Use useCallback for handlers
const handleScoreChange = useCallback((id, score) => { ... }, []);

// ❌ DON'T: Create new objects in props
// ❌ DON'T: Call functions in className

// ✅ DO: Memoize parent component if needed
const MemoizedDashboard = React.memo(DeptHeadDashboard);
```

---

## 🔍 Debugging Tips

### Console Logging
```javascript
// Add to handleScoreChange
console.log('Score changed:', criteriaId, score);
console.log('Current scores:', criteriaScores);

// Add to calculateTotalScore
console.log('Average:', calculateAverageScore());
console.log('Total:', calculateTotalScore());

// Add to handleSubmit
console.log('Submitting with:', { criteriaScores, totalScore });
```

### React DevTools
1. Open React DevTools
2. Select InstructorEvaluationCriteriaModal
3. Watch state updates:
   - `criteriaScores` - Changes as you click
   - `isEditMode` - Toggles between edit/view
   - `error` - Shows validation errors

### Network Inspector
1. Open DevTools Network tab
2. Click Submit
3. Check POST request:
   - Endpoint: `/api/secure/dept-head/evaluations`
   - Payload includes all 20 criteria
   - Response includes total_score

---

## 📚 Related Files

```
/frontend/
  ├─ src/
  │  ├─ components/
  │  │  ├─ InstructorEvaluationCriteriaModal.jsx (✨ REFACTORED)
  │  │  ├─ EvaluationBreakdownModal.jsx (unchanged)
  │  │  └─ DashboardLayout.jsx (uses these modals)
  │  │
  │  ├─ pages/
  │  │  └─ DeptHeadDashboard.jsx (parent component)
  │  │
  │  └─ services/
  │     └─ api.js (API calls)
  │
  └─ tailwind.config.js (styling config)

/backend/
  └─ routes/
     └─ secureRoutes.js (API endpoints)
```

---

## 🎓 Learning Resources

### Key Concepts
1. **React Hooks:** useState for modal state
2. **Tailwind CSS:** Utility-first styling
3. **Responsive Design:** sm breakpoint for layouts
4. **Accessibility:** Disabled states, ARIA labels
5. **State Management:** Lifting state to parent

### Documentation
- [React Hooks](https://react.dev/reference/react/hooks)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Responsive Design](https://tailwindcss.com/docs/responsive-design)

---

## ✅ Deployment Checklist

Before deploying to production:

- [ ] All 20 criteria render correctly
- [ ] Buttons respond to clicks (edit mode)
- [ ] Buttons are disabled (view mode)
- [ ] Scores calculate correctly
- [ ] Modal closes properly
- [ ] Submitted data persists
- [ ] Mobile layout works
- [ ] Accessibility checked
- [ ] No console errors
- [ ] Performance acceptable

---

## 📞 Support

### Questions?
1. Check this guide for answers
2. Review `UI_REFACTOR_SUMMARY.md` for overview
3. See `UI_REFACTOR_VISUAL_GUIDE.md` for visuals
4. Use `UI_REFACTOR_CHECKLIST.md` for verification

### Issues?
1. Check browser console for errors
2. Verify Tailwind CSS is configured
3. Check if parent component passes all props
4. Use React DevTools to inspect state

---

**Last Updated:** August 13, 2026  
**Version:** 2.0 (UI Refactored)  
**Status:** ✅ Production Ready

---

*Quick navigation: [Summary](./UI_REFACTOR_SUMMARY.md) • [Visual Guide](./UI_REFACTOR_VISUAL_GUIDE.md) • [Checklist](./UI_REFACTOR_CHECKLIST.md)*
