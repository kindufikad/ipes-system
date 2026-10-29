import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { evaluationApi } from '../services/api';

const DEFAULT_TEMPLATE = () => ({
  name: 'Standard Student Evaluation Form',
  academicYear: '2024/2025',
  semester: 'Semester I',
  target: 'Students evaluating Instructors',
  rating: { min: 1, max: 5 },
  maxScore: 100,
  enableGeneralComments: true,
  enableStrengthsAreas: true,
  categories: [
    {
      id: 'core',
      title: { en: 'Core Competency', am: 'የመሠረታዊ ብቃት መስፈርቶች' },
      items: [
        { id: 's1', en: 'The course objective, content, and relevance are clearly stated.', am: 'የትምህርቱን ዓላማ፣ ይዘት/ ኮርስ አውትላይን በግልጽ ያውቃል፤' },
        { id: 's2', en: 'The instructor prepares and shares a well-structured course outline.', am: 'ለሚያስተምረው ትምህርት ተገቢ ዝግጅት አድርጎ በትምህርት ዝርዝር ይዘት መሠረት ያቀርባል፤' },
        { id: 's3', en: 'Relevant reference books and supplemental materials are prepared.', am: 'ለሚያስተምረው ትምህርት አስፈላጊ ጽሑፍ ይመድባል፤' },
        { id: 's4', en: 'Provides practical activities such as labs or case studies.', am: 'እንደአስፈላጊነቱ የተግባር ልምምድ ይሰጣል።' },
        { id: 's5', en: 'Demonstrates strong foundational knowledge and skills.', am: 'ለሚያስተምረው ትምህርት ላይ መሠረታዊ እና ዘመናዊ እውቀት አለው፤' },
        { id: 's6', en: 'The instructor demonstrates strong foundational knowledge and skill in the subject.', am: 'መምህሩ በትምህርቱ ላይ ጠንካራ መሰረታዊ እውቀት እና ብቃት ያሳያል።' },
      ],
    },
    {
      id: 'professional',
      title: { en: 'Professional Competency', am: 'የሙያ ብቃት መስፈርቶች' },
      items: [
        { id: 's7', en: 'The instructor communicates clearly and uses appropriate teaching aids.', am: 'መምህሩ በግልጽ ይገልጻል እና ተገቢ የማስተማሪያ መሳሪያዎችን ይጠቀማል።' },
        { id: 's8', en: 'The instructor provides timely feedback on classwork, homework, and quizzes.', am: 'መምህሩ በትምህርት ስራ፣ ቤት ስራ እና ካውዚ ላይ በወቅቱ አስተያየት ይሰጣል።' },
        { id: 's9', en: 'The instructor encourages cooperative learning and active participation in class.', am: 'መምህሩ የጋራ መማር እና ንቁ ተሳትፎን በክፍል ውስጥ ያበረታታል።' },
        { id: 's10', en: 'The instructor uses continuous assessment effectively and communicates results clearly.', am: 'መምህሩ ቀጣይነት ያለው ተግባር በብቃት ይጠቀማል እና ውጤቶቹን በግልጽ ይገልጻል።' },
        { id: 's11', en: 'The instructor provides appropriate support to both low-achieving and high-achieving students.', am: 'መምህሩ ለዝቅተኛ እና ከፍተኛ ውጤት ያላቸው ተማሪዎች ተገቢ ድጋፍ ይሰጣል።' },
        { id: 's12', en: 'The instructor demonstrates professionalism and respect.', am: 'መምህሩ ሙያዊ ስነ-ምግባር እና ጥንካሬ ያለው ባህሪ ያሳያል።' },
        { id: 's13', en: 'The instructor ensures exams align with taught content.', am: 'መምህሩ ፈተናዎች እና ግምገባዎች ከተማርነው ይዘት ጋር ይስማማሉ።' },
        { id: 's14', en: 'Provides appropriate references and materials.', am: 'ተጨማሪ እና ተዛማጅ የማጣቀሻ መጽሐፍት ተዘጋጅተዋል።' },
      ],
    },
    {
      id: 'ethical',
      title: { en: 'Ethical Competency', am: 'የስነ-ምግባር ብቃት መስፈርቶች' },
      items: [
        { id: 's15', en: 'The instructor treats students with respect and creates a supportive learning environment.', am: 'መምህሩ ተማሪዎችን በአክብሮት ይይዛል።' },
        { id: 's16', en: 'Accepts student questions patiently and allows expression.', am: 'መምህሩ የተማሪዎችን ጥያቄዎች በትዕግስት ይቀበላል።' },
        { id: 's17', en: 'Handles students impartially and fairly.', am: 'መምህሩ ተማሪዎችን እኩል አድልዎ ይቆጣጠራል።' },
        { id: 's18', en: 'Demonstrates professional ethics.', am: 'መምህሩ ሙያዊ ስነ-ምግባር ያሳያል።' },
      ],
    },
    {
      id: 'time',
      title: { en: 'Time Management', am: 'የጊዜ አጠቃቀም መስፈርቶች' },
      items: [
        { id: 's19', en: 'Arrives punctually and uses sessions productively.', am: 'መምህሩ በሰዓቱ ይገባል።' },
        { id: 's20', en: 'Maintains consistency in class delivery and follow-up.', am: 'መምህሩ በክፍል አቅርቦት እና ተከታታይ ክትትል ላይ ይቆያል።' },
      ],
    },
  ],
});

const uid = () => `id_${Math.random().toString(36).slice(2, 9)}`;

export default function EvaluationTemplateBuilder({ templateId = null, initial = null, onClose = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState(DEFAULT_TEMPLATE());
  const [removingIds, setRemovingIds] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (initial) {
      // If initial is object with template_data shape
      if (initial.template_data && typeof initial.template_data === 'object') {
        setState(initial.template_data);
      } else if (typeof initial === 'object') {
        setState(initial);
      }
    }
  }, [initial]);

  const updateMeta = (patch) => setState((s) => ({ ...s, ...patch }));

  const addItem = (categoryId) => {
    const item = { id: uid(), en: '', am: '' };
    setState((s) => ({ ...s, categories: s.categories.map((c) => (c.id === categoryId ? { ...c, items: [...c.items, item] } : c)) }));
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  };

  const addCategory = () => {
    const newCat = { id: uid(), title: { en: 'New Category', am: 'አዲስ ምድብ' }, items: [] };
    setState((s) => ({ ...s, categories: [...s.categories, newCat] }));
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  };

  const changeItem = (categoryId, itemId, field, value) => {
    setState((s) => ({ ...s, categories: s.categories.map((c) => (c.id === categoryId ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)) } : c)) }));
  };

  const removeItem = (categoryId, itemId) => {
    setRemovingIds((r) => [...r, itemId]);
    setTimeout(() => {
      setState((s) => ({ ...s, categories: s.categories.map((c) => (c.id === categoryId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c)) }));
      setRemovingIds((r) => r.filter((id) => id !== itemId));
    }, 240);
  };

  // Helpers to flatten and rebuild categories
  const flatten = (cats) => {
    const flat = [];
    cats.forEach((c, ci) => {
      c.items.forEach((it, ii) => flat.push({ categoryId: c.id, categoryIndex: ci, itemId: it.id, item: it, itemIndex: ii }));
    });
    return flat;
  };

  const rebuildFromFlat = (flat, categoriesOrder) => {
    const map = {};
    flat.forEach((f) => {
      if (!map[f.categoryId]) map[f.categoryId] = [];
      map[f.categoryId].push(f.item);
    });
    return categoriesOrder.map((c) => ({ ...c, items: map[c.id] ? map[c.id] : [] }));
  };

  const handleMove = (categoryId, itemId, direction) => {
    setState((s) => {
      const cats = s.categories;
      const flat = flatten(cats);
      const idx = flat.findIndex((f) => f.itemId === itemId);
      if (idx === -1) return s;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= flat.length) return s;
      const newFlat = [...flat];
      const tmp = newFlat[swapIdx];
      newFlat[swapIdx] = newFlat[idx];
      newFlat[idx] = tmp;
      // keep category order
      const newCategories = rebuildFromFlat(newFlat, cats);
      return { ...s, categories: newCategories };
    });
  };

  const handleMoveUp = (categoryId, itemId) => handleMove(categoryId, itemId, 'up');
  const handleMoveDown = (categoryId, itemId) => handleMove(categoryId, itemId, 'down');

  const saveTemplate = async () => {
    // Build order_index across entire template
    const flat = flatten(state.categories);
    const withOrder = flat.map((f, index) => ({ ...f.item, categoryId: f.categoryId, order_index: index + 1 }));
    // Re-compose categories with order indices
    const categories = state.categories.map((c) => ({ ...c, items: withOrder.filter((it) => it.categoryId === c.id).map(({ order_index, categoryId, ...rest }) => ({ ...rest, order_index })) }));
    const payload = { name: state.name, template_data: { ...state, categories } };
    try {
      if (templateId) {
        await evaluationApi.updateTemplate(templateId, payload);
      } else {
        await evaluationApi.saveTemplate(payload);
      }
      onSaved(payload.template_data);
    } catch (err) {
      console.error('Failed to save template', err);
      throw err;
    }
  };

  // Auto-grow textarea
  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  };

  // Compute numbering
  const flattened = flatten(state.categories);

  return (
    <div className="w-full max-w-3xl rounded-2xl bg-white shadow-lg">
      <div className="flex flex-col h-[85vh] max-h-[85vh]">
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Edit Evaluation Template - Instructor Performance Evaluation</h3>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-gray-500">✕</button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input value={state.name} onChange={(e) => updateMeta({ name: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Template Name" />
            <input value={state.academicYear} onChange={(e) => updateMeta({ academicYear: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Academic Year" />
            <select value={state.semester} onChange={(e) => updateMeta({ semester: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option>Semester I</option>
              <option>Semester II</option>
            </select>
            <input value={state.target} onChange={(e) => updateMeta({ target: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Evaluation Target" />
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Rating Min</label>
              <input type="number" value={state.rating.min} onChange={(e) => updateMeta({ rating: { ...state.rating, min: Number(e.target.value) } })} className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Rating Max</label>
              <input type="number" value={state.rating.max} onChange={(e) => updateMeta({ rating: { ...state.rating, max: Number(e.target.value) } })} className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <label className="text-sm text-gray-600">Max Total Score</label>
              <input type="number" value={state.maxScore} onChange={(e) => updateMeta({ maxScore: Number(e.target.value) })} className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>

          {state.categories.map((cat) => (
            <div key={cat.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold">{cat.title.en} <span className="text-sm text-gray-500">/ {cat.title.am}</span></h4>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => addItem(cat.id)} className="rounded-full bg-ieps-blue-600 px-3 py-1 text-xs font-semibold text-white">+ Add Item</button>
                </div>
              </div>

              <div className="space-y-3">
                {cat.items.map((it) => {
                  const flatIndex = flattened.findIndex((f) => f.itemId === it.id);
                  const number = flatIndex + 1;
                  const isRemoving = removingIds.includes(it.id);
                  return (
                    <div key={it.id} className={`rounded-xl border border-white bg-white p-3 transition-all duration-200 ${isRemoving ? 'opacity-0 translate-x-4' : 'opacity-100'}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center text-sm text-gray-500 w-10">
                          <div className="font-semibold">#{number}</div>
                          <div className="flex flex-col gap-1 mt-2">
                            <button title="Move up" onClick={() => handleMoveUp(cat.id, it.id)} className="text-gray-500 hover:text-gray-700">⬆️</button>
                            <button title="Move down" onClick={() => handleMoveDown(cat.id, it.id)} className="text-gray-500 hover:text-gray-700">⬇️</button>
                          </div>
                        </div>

                        <div className="flex-1">
                          <div className="grid gap-2 md:grid-cols-2">
                            <div>
                              <label className="text-xs text-gray-600">English</label>
                              <textarea
                                value={it.en || ''}
                                onChange={(e) => { changeItem(cat.id, it.id, 'en', e.target.value); autoGrow(e.target); }}
                                onInput={(e) => autoGrow(e.target)}
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
                                rows={2}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">አማርኛ</label>
                              <textarea
                                value={it.am || ''}
                                onChange={(e) => { changeItem(cat.id, it.id, 'am', e.target.value); autoGrow(e.target); }}
                                onInput={(e) => autoGrow(e.target)}
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
                                rows={2}
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button onClick={() => removeItem(cat.id, it.id)} className="text-red-500 text-sm transition-opacity hover:opacity-80">🗑️ Remove</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-3">
            <button onClick={addCategory} className="rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-700">+ Add New Category</button>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={state.enableGeneralComments} onChange={(e) => updateMeta({ enableGeneralComments: e.target.checked })} />
              <span>ስለ መምህሩ አጠቃላይ አስተያየት (General Comments)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={state.enableStrengthsAreas} onChange={(e) => updateMeta({ enableStrengthsAreas: e.target.checked })} />
              <span>በጥንካሬ የሚነሱ እና ሊታረሙ የሚገባቸው ጎኖች (Strengths & Areas for Improvement)</span>
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 bg-white border-t border-gray-100 p-4 flex items-center justify-end gap-3">
          <button onClick={() => setState(DEFAULT_TEMPLATE())} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Reset Defaults</button>
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={async () => { await saveTemplate(); onClose(); }} className="rounded-xl bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white">Save Template</button>
        </div>
      </div>
    </div>
  );
}
