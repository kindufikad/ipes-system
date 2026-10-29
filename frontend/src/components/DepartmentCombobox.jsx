import { useMemo, useState } from 'react';

const DepartmentCombobox = ({ departments = [], value = '', onChange, disabled = false, required = false }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedDepartment = departments.find((department) => String(department.id) === String(value));

  const groupedOptions = useMemo(() => {
    const groups = new Map();
    departments.forEach((department) => {
      const collegeName = String(department.college_name ?? department.collegeName ?? '').trim() || 'OTHER DEPARTMENTS';
      const searchText = `${department.name || ''} ${department.code || ''}`.toLowerCase();
      if (!searchText.includes(query.trim().toLowerCase())) return;
      if (!groups.has(collegeName)) groups.set(collegeName, []);
      groups.get(collegeName).push({ value: String(department.id), label: department.name, code: department.code });
    });
    return Array.from(groups, ([label, options]) => ({ label, options }));
  }, [departments, query]);

  const selectDepartment = (departmentId) => {
    onChange?.({ target: { name: 'department_id', value: departmentId } });
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div
      className="relative mt-2"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false); }}
    >
      <input
        type="text"
        role="combobox"
        value={isOpen ? query : selectedDepartment?.name || ''}
        onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls="department-options"
        aria-autocomplete="list"
        placeholder="Search departments..."
        className="h-11 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-normal text-blue-900 outline-none transition placeholder:text-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        disabled={disabled}
        required={required && !value}
      />
      {isOpen && !disabled && (
        <div id="department-options" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {groupedOptions.length ? groupedOptions.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-blue-700">{group.label}</p>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={String(value) === option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDepartment(option.value)}
                  className="block w-full px-3 py-2 text-left text-sm text-blue-900 hover:bg-blue-50 hover:text-blue-700"
                >
                  {option.label}{option.code ? ` (${option.code})` : ''}
                </button>
              ))}
            </div>
          )) : <p className="px-3 py-3 text-sm text-blue-500">No departments found.</p>}
        </div>
      )}
      <input type="hidden" name="department_id" value={value} required={required} onChange={() => {}} />
    </div>
  );
};

export default DepartmentCombobox;