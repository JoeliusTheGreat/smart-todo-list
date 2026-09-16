// App State
let todos = [];
let calendarConnected = false;
let userEmail = null;
let currentMonth = new Date();
let selectedDate = new Date();
let defaultDueDate = null;
let groupDefaultDueDates = {
    personal: null,
    school: null,
    running: null
};
let currentFilter = 'all';
let currentGroupFilter = null;

const DEFAULT_CATEGORIES = {
    work: { name: 'Work', icon: '', color: '#1976d2' },
    personal: { name: 'Personal', icon: '', color: '#7b1fa2' },
    shopping: { name: 'Shopping', icon: '', color: '#e65100' },
    health: { name: 'Health', icon: '', color: '#388e3c' },
    urgent: { name: 'Urgent', icon: '', color: '#c62828' },
    other: { name: 'Other', icon: '', color: '#616161' }
};

let categories = loadCategories();
let groupCategories = loadGroupCategories();

function loadCategories() {
    const saved = localStorage.getItem('customCategories');
    if (!saved) {
        return { ...DEFAULT_CATEGORIES };
    }

    try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            return parsed;
        }
    } catch (error) {
        console.warn('Unable to load custom categories:', error);
    }

    return { ...DEFAULT_CATEGORIES };
}

function saveCategories() {
    localStorage.setItem('customCategories', JSON.stringify(categories));
    scheduleSyncPush();
}

function loadGroupCategories() {
    const saved = localStorage.getItem('groupCategories');
    const defaults = {
        personal: { ...DEFAULT_CATEGORIES },
        school: { ...DEFAULT_CATEGORIES },
        running: { ...DEFAULT_CATEGORIES }
    };

    if (!saved) {
        return defaults;
    }

    try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
            const merged = { ...parsed };
            Object.keys(defaults).forEach(groupKey => {
                if (!merged[groupKey]) {
                    merged[groupKey] = defaults[groupKey];
                }
            });
            return merged;
        }
    } catch (error) {
        console.warn('Unable to load group categories:', error);
    }

    return defaults;
}

function saveGroupCategories() {
    localStorage.setItem('groupCategories', JSON.stringify(groupCategories));
    scheduleSyncPush();
}

function getCategoryData(categoryKey) {
    return categories[categoryKey]
        || categories.other
        || Object.values(categories)[0]
        || DEFAULT_CATEGORIES.other;
}

function formatCategoryLabel(categoryInfo) {
    return categoryInfo.icon ? `${categoryInfo.icon} ${categoryInfo.name}` : categoryInfo.name;
}

function hexToRgbParts(hex) {
    const clean = (hex || '').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const num = parseInt(full, 16);
    if (full.length !== 6 || isNaN(num)) {
        return [102, 116, 224];
    }
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hexToRgba(hex, alpha) {
    const [r, g, b] = hexToRgbParts(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenHex(hex, percent) {
    const [r, g, b] = hexToRgbParts(hex);
    const blend = channel => Math.round(channel + (255 - channel) * percent);
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
}

function getCategoryBadgeStyle(categoryInfo) {
    const color = categoryInfo.color || '#667eea';
    return `background: ${hexToRgba(color, 0.16)}; color: ${lightenHex(color, 0.4)};`;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateKey(dateString) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatDisplayDate(dateString) {
    if (!dateString) return 'No date';
    return parseDateKey(dateString).toLocaleDateString();
}

function parseInlineDateFromText(text) {
    if (!text || typeof text !== 'string') return null;

    const cleaned = text.trim();
    if (!cleaned) return null;

    const lower = cleaned.toLowerCase();

    if (lower.includes('today')) return formatDateKey(new Date());
    if (lower.includes('tomorrow')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return formatDateKey(d);
    }

    const naturalMap = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
        friday: 5, saturday: 6
    };
    for (const [name, dayIndex] of Object.entries(naturalMap)) {
        if (lower.includes(name)) {
            const today = new Date();
            const diff = (dayIndex - today.getDay() + 7) % 7;
            const d = new Date(today);
            d.setDate(today.getDate() + (diff === 0 ? 7 : diff));
            return formatDateKey(d);
        }
    }

    const relativeMatch = cleaned.match(/\b(next\s+(?:week|month|year)|next\s+\w+)\b/i);
    if (relativeMatch) {
        const token = relativeMatch[0].toLowerCase();
        if (token.includes('week')) {
            const d = new Date(); d.setDate(d.getDate() + 7); return formatDateKey(d);
        }
        if (token.includes('month')) {
            const d = new Date(); d.setMonth(d.getMonth() + 1); return formatDateKey(d);
        }
        if (token.includes('year')) {
            const d = new Date(); d.setFullYear(d.getFullYear() + 1); return formatDateKey(d);
        }
    }

    const monthDayMatch = cleaned.match(/(?:^|\s|[\(\[\{])((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=$|\s|[\),\]\}])/i);
    if (monthDayMatch) {
        const value = monthDayMatch[1].trim();
        if (value.includes('/')) {
            const [month, day, year] = value.split('/').map(part => part.trim());
            const parsedMonth = Number(month);
            const parsedDay = Number(day);
            if (!Number.isNaN(parsedMonth) && !Number.isNaN(parsedDay)) {
                const targetYear = year ? Number(year) : new Date().getFullYear();
                const d = new Date(targetYear, parsedMonth - 1, parsedDay);
                return formatDateKey(d);
            }
        }

        const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
        const monthText = value.match(/^[a-z]+/i)?.[0]?.toLowerCase();
        const dayText = value.match(/\d+/)?.[0];
        if (monthText && dayText) {
            const monthIndex = monthNames.indexOf(monthText.slice(0,3));
            const parsedDay = Number(dayText);
            if (monthIndex >= 0 && !Number.isNaN(parsedDay)) {
                const d = new Date(new Date().getFullYear(), monthIndex, parsedDay);
                return formatDateKey(d);
            }
        }
    }

    const slashMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (slashMatch) {
        const [, month, day, yearStr] = slashMatch;
        const d = new Date(Number(yearStr || new Date().getFullYear()), Number(month) - 1, Number(day));
        return formatDateKey(d);
    }

    return null;
}

const WEEKDAY_NAME_TO_INDEX = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};

// Detects a recurrence instruction like "(daily)" or "(weekly, monday)" inside a pasted line.
function parseRecurrenceFromText(text) {
    if (!text || typeof text !== 'string') return null;

    const dailyMatch = text.match(/\(?\s*\bdaily\b\s*\)?/i);
    if (dailyMatch) {
        return { type: 'daily', match: dailyMatch[0] };
    }

    const weeklyMatch = text.match(/\(?\s*\bweekly\b\s*(?:[, ]+\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*)?\)?/i);
    if (weeklyMatch) {
        const dayName = weeklyMatch[1] ? weeklyMatch[1].toLowerCase() : null;
        return { type: 'weekly', day: dayName ? WEEKDAY_NAME_TO_INDEX[dayName] : null, match: weeklyMatch[0] };
    }

    return null;
}

function formatMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// All occurrences of a recurring task that fall within the given month (0-indexed),
// optionally skipping anything before cutoffDate (used to avoid backdating the current month).
function generateMonthlyOccurrences(recurringTask, year, month, cutoffDate) {
    const dates = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        if (cutoffDate && d < cutoffDate) continue;

        if (recurringTask.type === 'daily') {
            dates.push(formatDateKey(d));
        } else if (recurringTask.type === 'weekly' && d.getDay() === recurringTask.day) {
            dates.push(formatDateKey(d));
        }
    }

    return dates;
}

function loadRecurringTasks() {
    const saved = localStorage.getItem('recurringTasks');
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Unable to load recurring tasks:', error);
        return [];
    }
}

function saveRecurringTasks(recurringTasks) {
    localStorage.setItem('recurringTasks', JSON.stringify(recurringTasks));
    scheduleSyncPush();
}

// Catches up every recurring task to the current month. Runs on load, so if the
// page wasn't opened on the 1st, the next time it IS opened it backfills whatever
// months were missed (including the current one).
function refillRecurringTasks() {
    let recurringTasks;
    try {
        recurringTasks = loadRecurringTasks();
    } catch (error) {
        console.error('Unable to load recurring tasks, skipping refill:', error);
        return;
    }
    if (!Array.isArray(recurringTasks) || recurringTasks.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonthKey = formatMonthKey(today);

    let changed = false;

    recurringTasks.forEach(task => {
        try {
            if (!task || typeof task !== 'object') return;

            if (typeof task.lastGeneratedMonth !== 'string' || !/^\d{4}-\d{2}$/.test(task.lastGeneratedMonth)) {
                // Malformed/missing marker — reset instead of crashing on it.
                task.lastGeneratedMonth = currentMonthKey;
                return;
            }

            if (task.lastGeneratedMonth >= currentMonthKey) return;

            if (task.active === false) {
                // Paused: fast-forward the marker without generating anything, so
                // resuming later continues from now instead of backfilling the gap.
                task.lastGeneratedMonth = currentMonthKey;
                return;
            }

            const [lastYear, lastMonthNum] = task.lastGeneratedMonth.split('-').map(Number);
            let cursor = new Date(lastYear, lastMonthNum, 1);
            let safety = 0;

            while (formatMonthKey(cursor) <= currentMonthKey && safety < 120) {
                const isCurrentMonth = formatMonthKey(cursor) === currentMonthKey;
                const dates = generateMonthlyOccurrences(task, cursor.getFullYear(), cursor.getMonth(), isCurrentMonth ? today : null);
                dates.forEach(dateStr => {
                    addTodo(task.text, dateStr, task.category, task.group, task.id);
                    changed = true;
                });
                cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
                safety += 1;
            }

            task.lastGeneratedMonth = currentMonthKey;
        } catch (error) {
            console.error('Skipping a recurring task due to an error:', error, task);
        }
    });

    try {
        saveRecurringTasks(recurringTasks);
    } catch (error) {
        console.error('Unable to save recurring tasks:', error);
    }
    if (changed) {
        saveTodos();
    }
}

const BASE_CALENDAR_GROUPS = {
    personal: { name: 'Personal', color: '#667eea', visible: true },
    school: { name: 'School', color: '#ff9800', visible: true },
    running: { name: 'Running', color: '#4caf50', visible: true }
};

function normalizeGroupKey(name) {
    const cleaned = (name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    return cleaned || 'new-section';
}

function getCalendarGroupKeys() {
    return Object.keys(loadCalendarGroupSettings());
}

function loadCalendarGroupSettings() {
    const saved = localStorage.getItem('calendarGroups');
    const defaults = { ...BASE_CALENDAR_GROUPS };

    if (!saved) {
        return defaults;
    }

    try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
            const merged = { ...defaults, ...parsed };
            Object.keys(merged).forEach(key => {
                const config = merged[key];
                if (!config || typeof config !== 'object') {
                    delete merged[key];
                    return;
                }
                merged[key] = {
                    name: config.name || key,
                    color: config.color || defaults[key]?.color || '#667eea',
                    visible: config.visible !== false,
                    collapsed: config.collapsed === true
                };
            });
            return merged;
        }
    } catch (error) {
        console.warn('Unable to load calendar group settings:', error);
    }

    return defaults;
}

function saveCalendarGroupSettings(settings) {
    localStorage.setItem('calendarGroups', JSON.stringify(settings));
    scheduleSyncPush();
}

function ensureGroupCategorySet(groupKey) {
    if (!groupCategories[groupKey]) {
        groupCategories[groupKey] = { ...DEFAULT_CATEGORIES };
    }
}

function renderMainCalendarGroups() {
    const container = document.getElementById('calendarGroupsContainer');
    if (!container) return;

    const groups = loadCalendarGroupSettings();
    const groupKeys = Object.keys(groups);

    container.innerHTML = groupKeys.map(groupKey => {
        const config = groups[groupKey] || { name: groupKey, color: '#667eea', visible: true };
        const safeName = escapeHtml(config.name || groupKey);
        const safeColor = config.color || '#667eea';
        const groupId = `group-${groupKey}`;

        return `
            <div class="calendar-group" data-group="${groupKey}" style="--group-color: ${safeColor};">
                <div class="calendar-group-header">
                    <div class="calendar-group-title">
                        <span class="group-bullet"></span>
                        <span>${safeName}</span>
                    </div>
                    <div class="calendar-group-actions">
                        <label class="visibility-toggle" title="${config.collapsed === true ? 'Expand section' : 'Collapse section'}">
                            <input type="checkbox" tabindex="-1" ${config.collapsed === true ? '' : 'checked'} data-toggle-group="${groupKey}">
                            <span class="visibility-indicator">-</span>
                        </label>
                    </div>
                </div>
                <div class="group-content">
                    <div class="section-subsection">
                        <h3>Quick Add</h3>
                        <div class="input-area">
                            <textarea id="pasteArea-${groupKey}" placeholder="Add ${safeName} tasks here... each line becomes a todo item. Add (daily) or (weekly, monday) to repeat a task."></textarea>
                            <div class="button-group">
                                <button class="btn-primary" onclick="addTodos(this.closest('.calendar-group'))">Add to Todos</button>
                                <button class="btn-secondary" onclick="clearPaste(this.closest('.calendar-group'))">Clear</button>
                            </div>
                            <div class="due-date-input-group">
                                <input type="date" id="defaultDueDate-${groupKey}" placeholder="Set default due date">
                                <button onclick="setDefaultDueDate(this.closest('.calendar-group'))">Set Date</button>
                            </div>
                            <div class="due-date-input-group">
                                <label for="categorySelect-${groupKey}" style="display:block; margin-bottom:4px; font-size:0.8rem; color:#666;">Category</label>
                                <select class="group-category-select" data-group-category-select="${groupKey}" id="categorySelect-${groupKey}"></select>
                            </div>
                        </div>
                    </div>

                    <div class="section-subsection">
                        <h3>Task Categories</h3>
                        <div class="category-editor">
                            <div class="category-editor-grid">
                                <label>
                                    Name
                                    <input type="text" id="newCategoryName-${groupKey}" placeholder="e.g. Study">
                                </label>
                                <label>
                                    Icon (optional)
                                    <input type="text" id="newCategoryIcon-${groupKey}" maxlength="2" placeholder="">
                                </label>
                                <label>
                                    Color
                                    <input type="color" id="newCategoryColor-${groupKey}" value="${safeColor}">
                                </label>
                                <button onclick="addCustomCategory(this.closest('.calendar-group'))">Add</button>
                            </div>
                            <div class="category-list"></div>
                        </div>
                    </div>

                    <div class="section-subsection">
                        <h3>Summary</h3>
                        <div class="stats">
                            <div class="stat">
                                <div class="stat-number" id="totalTodos-${groupKey}">0</div>
                                <div class="stat-label">Total</div>
                            </div>
                            <div class="stat">
                                <div class="stat-number" id="completedTodos-${groupKey}">0</div>
                                <div class="stat-label">Completed</div>
                            </div>
                            <div class="stat">
                                <div class="stat-number" id="pendingTodos-${groupKey}">0</div>
                                <div class="stat-label">Pending</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderCategoryEditors();
    renderGroupCategorySelectors();
    updateCalendarGroupUI();
}

function updateCalendarGroupUI() {
    const settings = loadCalendarGroupSettings();

    document.querySelectorAll('.calendar-group').forEach(group => {
        const key = group.dataset.group;
        const config = settings[key] || BASE_CALENDAR_GROUPS[key];
        if (!config) return;

        group.style.setProperty('--group-color', config.color || '#667eea');
        const title = group.querySelector('.calendar-group-title span:last-child');
        if (title) {
            title.textContent = config.name || key;
        }

        const toggle = group.querySelector('[data-toggle-group]');
        if (toggle) {
            toggle.checked = config.collapsed !== true;
        }

        group.classList.toggle('hidden', config.collapsed === true);
    });
}

function editCalendarGroup(key) {
    const settings = loadCalendarGroupSettings();
    const current = settings[key] || BASE_CALENDAR_GROUPS[key];
    if (!current) return;

    const name = prompt('Edit calendar name:', current.name || key);
    if (name !== null && name.trim()) {
        current.name = name.trim();
    }

    const color = prompt('Edit calendar color as a hex value (for example #667eea):', current.color || '#667eea');
    if (color !== null) {
        const trimmedColor = (color || '').trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(trimmedColor)) {
            current.color = trimmedColor;
        } else if (trimmedColor) {
            alert('Please enter a valid hex color like #667eea');
            return;
        }
    }

    settings[key] = current;
    saveCalendarGroupSettings(settings);
    renderMainCalendarGroups();
    renderCategoryFilters();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
}

function renderMajorSectionSettings() {
    const container = document.getElementById('majorSectionSettingsList');
    if (!container) return;

    const groups = loadCalendarGroupSettings();
    container.innerHTML = Object.entries(groups)
        .map(([key, config]) => `
            <div class="settings-card">
                <label for="majorName-${key}">Section Name</label>
                <input id="majorName-${key}" type="text" value="${escapeHtml(config.name || key)}" data-major-section-name="${key}">
                <label for="majorColor-${key}">Section Color</label>
                <input id="majorColor-${key}" type="color" value="${config.color || '#667eea'}" data-major-section-color="${key}">
                <label style="display:flex; align-items:center; gap:8px; font-size:0.85em;">
                    <input type="checkbox" tabindex="-1" data-major-section-visible="${key}" ${config.visible !== false ? 'checked' : ''}>
                    Visible on main page
                </label>
                <button type="button" class="btn-secondary" data-delete-major-section="${key}">Delete Section</button>
            </div>
        `)
        .join('');
}

function deleteMajorSection(groupKey) {
    const groups = loadCalendarGroupSettings();
    if (!groupKey || !groups[groupKey]) return;

    if (Object.keys(groups).length <= 1) {
        alert('You need at least one major section on the page.');
        return;
    }

    const confirmed = confirm(`Delete the "${groups[groupKey].name || groupKey}" section?`);
    if (!confirmed) return;

    delete groups[groupKey];
    delete groupCategories[groupKey];

    const fallbackGroup = Object.keys(groups).includes('personal') ? 'personal' : Object.keys(groups)[0];

    todos = todos.map(todo => {
        if (todo.group !== groupKey) return todo;
        return { ...todo, group: fallbackGroup };
    });

    const recurringTasks = loadRecurringTasks().map(task => {
        if (task.group !== groupKey) return task;
        return { ...task, group: fallbackGroup };
    });
    saveRecurringTasks(recurringTasks);

    if (currentGroupFilter === groupKey) {
        currentGroupFilter = null;
        currentFilter = 'all';
    }

    saveCalendarGroupSettings(groups);
    saveGroupCategories();
    saveTodos();
    renderMajorSectionSettings();
    renderMainCalendarGroups();
    renderCategoryFilters();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
    renderRepeatingTasks();
}

function addMajorSection(name, color) {
    const cleanedName = (name || '').trim();
    if (!cleanedName) {
        alert('Please enter a name for the new major section.');
        return;
    }

    const groups = loadCalendarGroupSettings();
    const baseKey = normalizeGroupKey(cleanedName);
    let key = baseKey;
    let suffix = 2;
    while (groups[key]) {
        key = `${baseKey}-${suffix}`;
        suffix += 1;
    }

    groups[key] = {
        name: cleanedName,
        color: color || '#8b5cf6',
        visible: true
    };

    ensureGroupCategorySet(key);
    saveCalendarGroupSettings(groups);
    renderMajorSectionSettings();
    renderMainCalendarGroups();
    renderCategoryFilters();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();

    const newNameInput = document.getElementById('newMajorSectionName');
    const newColorInput = document.getElementById('newMajorSectionColor');
    if (newNameInput) newNameInput.value = '';
    if (newColorInput) newColorInput.value = '#8b5cf6';
}

document.addEventListener('click', event => {
    const toggleSelector = 'input[type="checkbox"][data-toggle-group], input[type="checkbox"][data-major-section-visible], input[type="checkbox"][data-calendar-group-toggle]';
    const label = event.target.closest('label');
    const checkbox = event.target.closest(toggleSelector) || (label ? label.querySelector(toggleSelector) : null);
    if (!checkbox) return;

    event.preventDefault();
    event.stopPropagation();

    const nextValue = !checkbox.checked;
    checkbox.checked = nextValue;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
});

document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-group]');
    if (editButton) {
        const key = editButton.dataset.editGroup;
        editCalendarGroup(key);
    }

    const deleteMajorSectionBtn = event.target.closest('[data-delete-major-section]');
    if (deleteMajorSectionBtn) {
        deleteMajorSection(deleteMajorSectionBtn.dataset.deleteMajorSection);
    }

    const addMajorSectionBtn = event.target.closest('#addMajorSectionBtn');
    if (addMajorSectionBtn) {
        const input = document.getElementById('newMajorSectionName');
        const colorInput = document.getElementById('newMajorSectionColor');
        addMajorSection(input ? input.value : '', colorInput ? colorInput.value : '#8b5cf6');
    }
});

document.addEventListener('change', event => {
    const toggle = event.target.closest('[data-toggle-group]');
    if (toggle) {
        const settings = loadCalendarGroupSettings();
        const key = toggle.dataset.toggleGroup;
        settings[key] = { ...(settings[key] || BASE_CALENDAR_GROUPS[key] || { name: key, color: '#667eea' }), collapsed: !toggle.checked };
        saveCalendarGroupSettings(settings);
        event.target.blur();
        preserveScrollAndRerender(() => {
            updateCalendarGroupUI();
        }, 'data-toggle-group', key);
        return;
    }

    const majorName = event.target.closest('[data-major-section-name]');
    if (majorName) {
        const settings = loadCalendarGroupSettings();
        const key = majorName.dataset.majorSectionName;
        settings[key] = { ...(settings[key] || { name: key, color: '#667eea', visible: true }), name: majorName.value.trim() || key, visible: settings[key]?.visible !== false };
        saveCalendarGroupSettings(settings);
        renderMajorSectionSettings();
        renderMainCalendarGroups();
        renderCategoryFilters();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
        return;
    }

    const majorColor = event.target.closest('[data-major-section-color]');
    if (majorColor) {
        const settings = loadCalendarGroupSettings();
        const key = majorColor.dataset.majorSectionColor;
        settings[key] = { ...(settings[key] || { name: key, color: '#667eea', visible: true }), color: majorColor.value || '#667eea' };
        saveCalendarGroupSettings(settings);
        renderMajorSectionSettings();
        renderMainCalendarGroups();
        renderCategoryFilters();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
        return;
    }

    const majorVisible = event.target.closest('[data-major-section-visible]');
    if (majorVisible) {
        const settings = loadCalendarGroupSettings();
        const key = majorVisible.dataset.majorSectionVisible;
        settings[key] = { ...(settings[key] || { name: key, color: '#667eea', visible: true }), visible: majorVisible.checked };
        saveCalendarGroupSettings(settings);
        event.target.blur();
        preserveScrollAndRerender(() => {
            renderMajorSectionSettings();
            updateCalendarGroupUI();
            renderCategoryFilters();
            renderTodos();
            renderCalendar();
            renderTimeline();
            renderCompleted();
            renderPriority();
            renderPastDue();
            renderNoDueDate();
        }, 'data-major-section-visible', key);
        return;
    }

    const calendarGroupToggle = event.target.closest('[data-calendar-group-toggle]');
    if (calendarGroupToggle) {
        const settings = loadCalendarGroupSettings();
        const key = calendarGroupToggle.dataset.calendarGroupToggle;
        settings[key] = { ...(settings[key] || { name: key, color: '#667eea', visible: true }), visible: calendarGroupToggle.checked };
        saveCalendarGroupSettings(settings);
        event.target.blur();
        preserveScrollAndRerender(() => {
            updateCalendarGroupUI();
            renderCategoryFilters();
            renderTodos();
            renderCalendar();
            renderTimeline();
            renderCompleted();
            renderPriority();
            renderPastDue();
            renderNoDueDate();
        }, 'data-calendar-group-toggle', key);
    }
});

document.addEventListener('input', event => {
    const dateInput = event.target.closest('input[type="date"]');
    if (!dateInput) return;

    const group = dateInput.closest('.calendar-group');
    const key = group ? group.dataset.group : 'personal';
    groupDefaultDueDates[key] = dateInput.value || null;
    defaultDueDate = dateInput.value || null;
});

document.addEventListener('change', event => {
    const dateInput = event.target.closest('input[type="date"]');
    if (!dateInput) return;

    const group = dateInput.closest('.calendar-group');
    const key = group ? group.dataset.group : 'personal';
    groupDefaultDueDates[key] = dateInput.value || null;
    defaultDueDate = dateInput.value || null;
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    renderMainCalendarGroups();
    renderMajorSectionSettings();
    loadTodos();
    try {
        refillRecurringTasks();
    } catch (error) {
        console.error('Recurring task refill failed, continuing without it:', error);
    }
    renderCategoryFilters();
    renderCategoryEditors();
    renderGroupCategorySelectors();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
    renderRepeatingTasks();
    checkGoogleCalendarAuth();

    const addMajorSectionBtn = document.getElementById('addMajorSectionBtn');
    if (addMajorSectionBtn) {
        addMajorSectionBtn.addEventListener('click', () => {
            const input = document.getElementById('newMajorSectionName');
            const colorInput = document.getElementById('newMajorSectionColor');
            addMajorSection(input ? input.value : '', colorInput ? colorInput.value : '#8b5cf6');
        });
    }
});

function renderGroupCategorySelectors() {
    document.querySelectorAll('.group-category-select').forEach(select => {
        const groupKey = select.dataset.groupCategorySelect || 'personal';
        const entries = groupCategories[groupKey] || categories;
        const currentValue = select.value || 'other';

        select.innerHTML = Object.entries(entries)
            .map(([key, category]) => `<option value="${key}">${formatCategoryLabel(category)}</option>`)
            .join('');

        if (entries[currentValue]) {
            select.value = currentValue;
        } else if (entries.other) {
            select.value = 'other';
        } else {
            select.selectedIndex = 0;
        }
    });
}

// Add todos from pasted text
function addTodos(groupContext = null) {
    const group = groupContext && groupContext.closest ? groupContext.closest('.calendar-group') : document.querySelector('.calendar-group[data-group="personal"]');
    const pasteArea = group ? group.querySelector('textarea') : document.getElementById('pasteArea');
    const text = pasteArea ? pasteArea.value.trim() : '';

    if (!text) {
        alert('Please paste some text first!');
        return;
    }

    const dueDateInput = group ? group.querySelector('input[type="date"]') : document.getElementById('defaultDueDate');
    const groupKey = group ? group.dataset.group : 'personal';
    const effectiveDueDate = dueDateInput && dueDateInput.value ? dueDateInput.value : groupDefaultDueDates[groupKey] || defaultDueDate;
    const categorySelect = group ? group.querySelector('.group-category-select') : null;
    const selectedCategory = categorySelect && categorySelect.value ? categorySelect.value : 'other';

    const items = text
        .split('\n')
        .map(item => item.trim())
        .filter(item => item.length > 0);

    if (items.length === 0) {
        alert('No valid items found in the pasted text.');
        return;
    }

    let lastParsedDate = null;
    let totalAdded = 0;
    const recurringTasks = loadRecurringTasks();
    let recurringTasksChanged = false;

    items.forEach(item => {
        const recurrence = parseRecurrenceFromText(item);
        if (recurrence) {
            const cleanText = item.replace(recurrence.match, ' ').replace(/\s{2,}/g, ' ').trim() || item;
            const anchor = (effectiveDueDate && parseDateKey(effectiveDueDate)) || new Date();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const recurringTask = {
                id: Date.now() + Math.random(),
                text: cleanText,
                type: recurrence.type,
                day: recurrence.type === 'weekly' ? (recurrence.day !== null ? recurrence.day : anchor.getDay()) : null,
                category: selectedCategory,
                group: groupKey,
                active: true,
                lastGeneratedMonth: formatMonthKey(today)
            };

            const dates = generateMonthlyOccurrences(recurringTask, today.getFullYear(), today.getMonth(), today);
            dates.forEach(dateStr => {
                addTodo(cleanText, dateStr, selectedCategory, groupKey, recurringTask.id);
                lastParsedDate = dateStr;
                totalAdded += 1;
            });

            recurringTasks.push(recurringTask);
            recurringTasksChanged = true;
            return;
        }

        const parsedDueDate = parseInlineDateFromText(item) || effectiveDueDate;
        if (parsedDueDate) {
            lastParsedDate = parsedDueDate;
        }
        addTodo(item, parsedDueDate, selectedCategory, groupKey);
        totalAdded += 1;
    });

    if (recurringTasksChanged) {
        saveRecurringTasks(recurringTasks);
    }

    if (lastParsedDate) {
        selectedDate = parseDateKey(lastParsedDate) || selectedDate;
    }

    if (pasteArea) pasteArea.value = '';
    saveTodos();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
    renderRepeatingTasks();

    alert(`Added ${totalAdded} item(s) to your todo list!`);
}

// Set default due date for new todos
function setDefaultDueDate(groupContext = null) {
    const group = groupContext && groupContext.closest ? groupContext.closest('.calendar-group') : document.querySelector('.calendar-group[data-group="personal"]');
    const input = group ? group.querySelector('input[type="date"]') : document.getElementById('defaultDueDate');
    if (input) {
        const key = group ? group.dataset.group : 'personal';
        groupDefaultDueDates[key] = input.value || null;
        defaultDueDate = input.value || null;
        if (input.value) {
            selectedDate = parseDateKey(input.value) || selectedDate;
            alert(`Default due date set to ${formatDisplayDate(input.value)}`);
        }
    }
}

// Add a single todo item
function addTodo(text, dueDate = null, category = 'other', groupKey = 'personal', recurringId = null) {
    const todo = {
        id: Date.now() + Math.random(),
        text: text,
        completed: false,
        priority: false,
        dueDate: dueDate,
        category: category,
        group: groupKey,
        recurringId: recurringId,
        createdAt: new Date().toISOString()
    };
    todos.push(todo);
}

// Toggle todo completion
function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodos();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
    }
}

function toggleTodoPriority(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.priority = !todo.priority;
        saveTodos();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
    }
}

// Rename a todo
function renameTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newText = prompt('Rename task:', todo.text);
    if (newText !== null) {
        const trimmed = newText.trim();
        if (!trimmed) {
            alert('Task name cannot be empty.');
            return;
        }

        todo.text = trimmed;
        saveTodos();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
    }
}

// Set due date for a todo
function setTodoDueDate(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newDate = prompt(`Set due date for "${todo.text}":\n(Format: YYYY-MM-DD or leave blank to remove)`);
    if (newDate !== null) {
        if (newDate === '') {
            todo.dueDate = null;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
            todo.dueDate = newDate;
        } else {
            alert('Invalid date format. Use YYYY-MM-DD');
            return;
        }
        saveTodos();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
    }
}

function closeTaskMenus() {
    document.querySelectorAll('.task-more-menu').forEach(menu => {
        menu.classList.remove('open');
    });
}

function positionTaskMenu(menu, button) {
    // Measure while hidden-but-displayed so offsetHeight is accurate, without a visible flash.
    menu.style.visibility = 'hidden';
    menu.classList.add('open');

    const rect = button.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;

    if (openUpward) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + 8}px`;
    }
    menu.style.right = `${window.innerWidth - rect.right}px`;

    menu.style.visibility = '';
}

function toggleTaskMenu(button) {
    const menu = button.nextElementSibling;
    if (!menu || !menu.classList.contains('task-more-menu')) return;

    const isOpen = menu.classList.contains('open');
    closeTaskMenus();
    if (!isOpen) {
        positionTaskMenu(menu, button);
    }
}

window.addEventListener('scroll', closeTaskMenus, true);
window.addEventListener('resize', closeTaskMenus);

document.addEventListener('click', (event) => {
    const menuButton = event.target.closest('.task-menu-button');
    if (menuButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleTaskMenu(menuButton);
        return;
    }

    const menuItem = event.target.closest('.task-menu-item');
    if (menuItem) {
        event.preventDefault();
        event.stopPropagation();
        const { taskId, action } = menuItem.dataset;
        if (action === 'rename') {
            renameTodo(Number(taskId));
        } else if (action === 'date') {
            setTodoDueDate(Number(taskId));
        } else if (action === 'priority') {
            toggleTodoPriority(Number(taskId));
        } else if (action === 'delete') {
            deleteTodo(Number(taskId));
        }
        closeTaskMenus();
        return;
    }

    if (!event.target.closest('.task-more-menu')) {
        closeTaskMenus();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeTaskMenus();
    }
});

// Set category for a todo
function setTodoCategory(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    let categoryChoices = 'Select a category:\n\n';
    Object.entries(categories).forEach(([key, cat]) => {
        categoryChoices += `${key} - ${cat.name}\n`;
    });

    const choice = prompt(categoryChoices + '\n(Enter one of the category keys above)');
    if (choice && categories[choice.toLowerCase()]) {
        todo.category = choice.toLowerCase();
        saveTodos();
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
    } else if (choice !== null) {
        alert('Invalid category. Please try again.');
    }
}

function normalizeCategoryKey(rawName) {
    const cleaned = (rawName || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    return cleaned || 'custom';
}

function addCustomCategory(groupContext = null) {
    const group = groupContext && groupContext.closest ? groupContext.closest('.calendar-group') : document.querySelector('.calendar-group[data-group="personal"]');
    const groupKey = group ? group.dataset.group : 'personal';
    const inputs = group ? group.querySelectorAll('.category-editor-grid input') : [];
    const nameInput = inputs[0] || document.getElementById('newCategoryName');
    const iconInput = inputs[1] || document.getElementById('newCategoryIcon');
    const colorInput = inputs[2] || document.getElementById('newCategoryColor');

    if (!nameInput || !iconInput || !colorInput) {
        alert('Please complete the category form first.');
        return;
    }

    const name = (nameInput.value || '').trim();
    if (!name) {
        alert('Please enter a category name first.');
        return;
    }

    const baseKey = normalizeCategoryKey(name);
    let key = baseKey;
    let suffix = 2;
    const groupSet = groupCategories[groupKey] || {};
    while (categories[key] || groupSet[key]) {
        key = `${baseKey}-${suffix}`;
        suffix += 1;
    }

    const categoryData = {
        name,
        icon: (iconInput.value || '').trim(),
        color: colorInput.value || '#667eea'
    };

    if (!groupCategories[groupKey]) {
        groupCategories[groupKey] = {};
    }
    groupCategories[groupKey][key] = categoryData;
    categories[key] = categoryData;

    saveCategories();
    saveGroupCategories();
    renderCategoryFilters();
    renderGroupCategoryEditor(groupKey);
    renderGroupCategorySelectors();
    renderTodos();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();

    nameInput.value = '';
    iconInput.value = '';
    colorInput.value = '#667eea';
}

function editCategory(groupKey, key) {
    const categorySet = groupCategories[groupKey] || categories;
    const category = categorySet[key];
    if (!category) return;

    const newName = prompt('Edit category name:', category.name);
    if (newName !== null) {
        const trimmed = newName.trim();
        if (trimmed) {
            category.name = trimmed;
            if (categories[key]) {
                categories[key].name = trimmed;
            }
        }
    }

    const newIcon = prompt('Edit category icon (optional):', category.icon);
    if (newIcon !== null) {
        category.icon = (newIcon || '').trim();
        if (categories[key]) {
            categories[key].icon = category.icon;
        }
    }

    const newColor = prompt('Edit category color as a hex value (for example #1976d2):', category.color || '#667eea');
    if (newColor !== null) {
        const trimmedColor = (newColor || '').trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(trimmedColor)) {
            category.color = trimmedColor;
            if (categories[key]) {
                categories[key].color = trimmedColor;
            }
        } else if (trimmedColor) {
            alert('Please enter a valid hex color like #1976d2');
            return;
        }
    }

    saveCategories();
    saveGroupCategories();
    renderCategoryFilters();
    renderGroupCategoryEditor(groupKey);
    renderGroupCategorySelectors();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
}

function deleteCategory(groupKey, key) {
    const categorySet = groupCategories[groupKey] || categories;
    if (Object.keys(categorySet).length <= 1) {
        alert('You need at least one category in the list.');
        return;
    }

    const category = categorySet[key];
    if (!category) return;

    const confirmed = confirm(`Delete the "${category.name}" category and move any tasks in it to "Other"?`);
    if (!confirmed) return;

    delete categorySet[key];
    delete categories[key];
    todos.forEach(todo => {
        if (todo.category === key) {
            todo.category = 'other';
        }
    });

    const recurringTasks = loadRecurringTasks();
    recurringTasks.forEach(task => {
        if (task.category === key) {
            task.category = 'other';
        }
    });
    saveRecurringTasks(recurringTasks);

    if (currentFilter === key) {
        currentFilter = 'all';
    }

    saveTodos();
    saveCategories();
    saveGroupCategories();
    renderCategoryFilters();
    renderGroupCategoryEditor(groupKey);
    renderGroupCategorySelectors();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
    renderRepeatingTasks();
}

// Delete a todo
function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
}

// Clear all todos
function clearAllTodos() {
    if (todos.length === 0) {
        alert('No todos to clear.');
        return;
    }

    if (confirm(`Are you sure you want to delete all ${todos.length} todos?`)) {
        todos = [];
        saveTodos();
        saveRecurringTasks([]);
        renderTodos();
        renderCalendar();
        renderTimeline();
        renderCompleted();
        renderPriority();
        renderPastDue();
        renderNoDueDate();
        renderRepeatingTasks();
    }
}

// Clear paste area
function clearPaste(groupContext = null) {
    const group = groupContext && groupContext.closest ? groupContext.closest('.calendar-group') : document.querySelector('.calendar-group[data-group="personal"]');
    const pasteArea = group ? group.querySelector('textarea') : document.getElementById('pasteArea');
    if (pasteArea) {
        pasteArea.value = '';
    }
}

// Render todos to UI
function getCategoryGroup(categoryKey, todo = null) {
    if (todo && todo.group) {
        return todo.group;
    }

    if (!categoryKey) return null;
    for (const [groupKey, entries] of Object.entries(groupCategories)) {
        if (entries && entries[categoryKey]) {
            return groupKey;
        }
    }
    return null;
}

function renderTodos() {
    const todoList = document.getElementById('todoList');

    let filteredTodos = todos.filter(todo => !todo.completed);
    if (currentGroupFilter) {
        filteredTodos = filteredTodos.filter(todo => {
            const categoryKey = todo.category || 'other';
            return getCategoryGroup(categoryKey, todo) === currentGroupFilter;
        });
    }

    if (currentFilter !== 'all' && currentFilter !== currentGroupFilter) {
        filteredTodos = filteredTodos.filter(todo => (todo.category || 'other') === currentFilter);
    }

    const groups = loadCalendarGroupSettings();

    if (filteredTodos.length === 0) {
        const message = todos.length === 0
            ? 'No todos yet. Paste a list to get started!'
            : currentGroupFilter && currentFilter === 'all'
                ? `No pending todos in ${groups[currentGroupFilter]?.name || currentGroupFilter}.`
                : currentFilter !== 'all'
                    ? `No pending todos in ${getCategoryData(currentFilter).name} category.`
                    : 'All caught up! Completed tasks moved to the Completed section.';
        todoList.innerHTML = `<div class="empty-state">${message}</div>`;
        updateStats();
        return;
    }

    const todayKey = formatDateKey(new Date());
    const groupsToRender = currentGroupFilter ? [currentGroupFilter] : getCalendarGroupKeys();

    const groupedTodos = {};
    filteredTodos.forEach(todo => {
        const categoryKey = todo.category || 'other';
        const groupKey = getCategoryGroup(categoryKey, todo) || todo.group || 'personal';
        if (!groupsToRender.includes(groupKey)) return;

        if (!groupedTodos[groupKey]) groupedTodos[groupKey] = {};
        if (!groupedTodos[groupKey][categoryKey]) groupedTodos[groupKey][categoryKey] = [];
        groupedTodos[groupKey][categoryKey].push(todo);
    });

    Object.values(groupedTodos).forEach(categoryMap => {
        Object.values(categoryMap).forEach(items => {
            items.sort((a, b) => {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return a.dueDate.localeCompare(b.dueDate);
            });
        });
    });

    const html = groupsToRender
        .filter(groupKey => groupedTodos[groupKey] && Object.keys(groupedTodos[groupKey]).length)
        .map(groupKey => {
            const groupName = groups[groupKey]?.name || groupKey;
            const subcategoryMarkup = Object.entries(groupedTodos[groupKey])
                .map(([categoryKey, items]) => {
                    const categoryInfo = getCategoryData(categoryKey);
                    const itemsMarkup = items.map(todo => {
                        const dueDateStr = todo.dueDate ? formatDisplayDate(todo.dueDate) : 'No date';
                        const isOverdue = todo.dueDate && !todo.completed && todo.dueDate < todayKey;
                        return `
                            <div class="todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} has-category cat-${categoryKey}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                                <input
                                    type="checkbox"
                                    class="todo-checkbox"
                                    style="accent-color: ${getTodoGroupColor(todo)};"
                                    ${todo.completed ? 'checked' : ''}
                                    onchange="toggleTodo(${todo.id})"
                                >
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="category-badge ${categoryKey}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                                        <span class="todo-text">${escapeHtml(todo.text)}</span>
                                    </div>
                                    <div style="font-size: 0.8em; color: #999; margin-top: 4px;">${dueDateStr}</div>
                                </div>
                                <div class="task-action-wrap">
                                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                                    <div class="task-more-menu" id="task-menu-${todo.id}">
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div class="todo-subgroup">
                            <div class="todo-subgroup-header">
                                <span>${formatCategoryLabel(categoryInfo)}</span>
                                <span>${items.length}</span>
                            </div>
                            <div class="todo-subgroup-list">
                                ${itemsMarkup}
                            </div>
                        </div>
                    `;
                })
                .join('');

            return `
                <div class="todo-group-section">
                    <div class="todo-group-header">${groupName}</div>
                    ${subcategoryMarkup}
                </div>
            `;
        })
        .join('');

    todoList.innerHTML = html || `<div class="empty-state">No todos match the current filter.</div>`;
    updateStats();
}

// Update statistics
function updateStats() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;

    const totalEl = document.getElementById('totalTodos');
    const completedEl = document.getElementById('completedTodos');
    const pendingEl = document.getElementById('pendingTodos');

    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (pendingEl) pendingEl.textContent = pending;

    loadCalendarGroupSettings();
    Object.keys(loadCalendarGroupSettings()).forEach(groupKey => {
        const groupTotal = todos.filter(todo => (todo.group || 'personal') === groupKey).length;
        const groupCompleted = todos.filter(todo => (todo.group || 'personal') === groupKey && todo.completed).length;
        const groupPending = groupTotal - groupCompleted;

        const totalGroupEl = document.getElementById(`totalTodos-${groupKey}`);
        const completedGroupEl = document.getElementById(`completedTodos-${groupKey}`);
        const pendingGroupEl = document.getElementById(`pendingTodos-${groupKey}`);

        if (totalGroupEl) totalGroupEl.textContent = groupTotal;
        if (completedGroupEl) completedGroupEl.textContent = groupCompleted;
        if (pendingGroupEl) pendingGroupEl.textContent = groupPending;
    });
}

// Filter todos by category
function filterByCategory(category, groupKey = null) {
    if (groupKey) {
        currentGroupFilter = groupKey;
        currentFilter = category;
    } else {
        currentGroupFilter = null;
        currentFilter = category;
    }
    renderCategoryFilters();
    renderTodos();
}

function filterByGroup(groupKey) {
    if (currentGroupFilter === groupKey && currentFilter === 'all') {
        currentGroupFilter = null;
        currentFilter = 'all';
    } else {
        currentGroupFilter = groupKey;
        currentFilter = 'all';
    }
    renderCategoryFilters();
    renderTodos();
}

function renderCategoryFilters() {
    const container = document.querySelector('.category-filter');
    if (!container) return;

    const groups = loadCalendarGroupSettings();
    const groupButtons = Object.keys(groups)
        .filter(groupKey => groups[groupKey]?.visible !== false)
        .map(groupKey => {
            const config = groups[groupKey] || { name: groupKey };
            const active = currentGroupFilter === groupKey && currentFilter === 'all';
            return `
                <button class="filter-btn ${active ? 'active' : ''}" onclick="filterByGroup('${groupKey}')">
                    ${config.name}
                </button>
            `;
        })
        .join('');

    let subgroup = '';
    if (currentGroupFilter) {
        const groups = loadCalendarGroupSettings();
        const entries = groupCategories[currentGroupFilter] || categories;
        const subButtons = Object.entries(entries)
            .map(([key, category]) => `
                <button class="filter-btn ${currentFilter === key ? 'active' : ''}" onclick="filterByCategory('${key}', '${currentGroupFilter}')">
                    ${formatCategoryLabel(category)}
                </button>
            `)
            .join('');

        subgroup = `
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; border-top:1px solid #e0e0e0; padding-top:10px;">
                <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', '${currentGroupFilter}')">All in ${groups[currentGroupFilter]?.name || currentGroupFilter}</button>
                ${subButtons}
            </div>
        `;
    }

    container.innerHTML = `
        <button class="filter-btn ${currentFilter === 'all' && !currentGroupFilter ? 'active' : ''}" onclick="filterByCategory('all')">All Tasks</button>
        ${groupButtons}
        ${subgroup}
    `;
}

function renderGroupCategoryEditor(groupKey) {
    const container = document.querySelector(`.calendar-group[data-group="${groupKey}"] .category-list`);
    if (!container) return;

    const entries = groupCategories[groupKey] || categories;
    const rows = Object.entries(entries)
        .map(([key, category]) => `
            <div class="category-row">
                <span class="category-pill" style="background:${category.color}; color:white; border-color:${category.color};">
                    ${formatCategoryLabel(category)}
                </span>
                <div class="category-actions">
                    <button class="mini-btn" onclick="editCategory('${groupKey}', '${key}')">Edit</button>
                    <button class="mini-btn danger" onclick="deleteCategory('${groupKey}', '${key}')">Delete</button>
                </div>
            </div>
        `)
        .join('');

    container.innerHTML = rows;
}

function renderCategoryEditors() {
    getCalendarGroupKeys().forEach(renderGroupCategoryEditor);
}

// Save todos to localStorage
function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
    scheduleSyncPush();
}

// Load todos from localStorage
function loadTodos() {
    const saved = localStorage.getItem('todos');
    if (saved) {
        try {
            todos = JSON.parse(saved);
        } catch (e) {
            console.error('Error loading todos:', e);
            todos = [];
        }
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Calendar Functions
// ==========================================

function isCalendarGroupVisible(groupKey) {
    const groups = loadCalendarGroupSettings();
    return groups[groupKey]?.visible !== false;
}

function getTodoGroupKey(todo) {
    if (todo && todo.group) {
        return todo.group;
    }

    const categoryKey = todo?.category || 'other';
    return getCategoryGroup(categoryKey, todo) || 'personal';
}

function getTodoGroupColor(todo) {
    const groupKey = getTodoGroupKey(todo);
    const settings = loadCalendarGroupSettings();
    return settings[groupKey]?.color || BASE_CALENDAR_GROUPS[groupKey]?.color || '#667eea';
}

function renderCalendarVisibilityControls() {
    const container = document.getElementById('calendarVisibilityControls');
    if (!container) return;

    const groups = loadCalendarGroupSettings();
    container.innerHTML = Object.entries(groups)
        .map(([groupKey, config]) => {
            const label = config?.name || groupKey;
            const checked = config?.visible !== false;
            return `
                <label class="calendar-visibility-item">
                    <input type="checkbox" tabindex="-1" data-calendar-group-toggle="${groupKey}" ${checked ? 'checked' : ''}>
                    <span>${escapeHtml(label)}</span>
                </label>
            `;
        })
        .join('');
}

function preserveScrollAndRerender(renderFn, anchorAttr, anchorValue) {
    const anchorSelector = anchorAttr && anchorValue !== undefined
        ? `[${anchorAttr}="${CSS.escape(String(anchorValue))}"]`
        : null;
    const anchorBefore = anchorSelector ? document.querySelector(anchorSelector) : null;
    const beforeTop = anchorBefore ? anchorBefore.getBoundingClientRect().top : null;

    const currentScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const currentScrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;

    try {
        renderFn();
    } finally {
        requestAnimationFrame(() => {
            if (anchorSelector && beforeTop !== null) {
                const anchorAfter = document.querySelector(anchorSelector);
                if (anchorAfter) {
                    const delta = anchorAfter.getBoundingClientRect().top - beforeTop;
                    if (delta) {
                        window.scrollBy(0, delta);
                    }
                    return;
                }
            }
            window.scrollTo({ top: currentScrollTop, left: currentScrollLeft, behavior: 'auto' });
        });
    }
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    renderCalendarVisibilityControls();

    // Update title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarTitle').textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '';

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayDiv = createDayElement(day, month - 1, year, true);
        calendarDays.appendChild(dayDiv);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = createDayElement(day, month, year, false);
        calendarDays.appendChild(dayDiv);
    }

    // Next month days
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = createDayElement(day, month + 1, year, true);
        calendarDays.appendChild(dayDiv);
    }

    // Render tasks for selected date
    renderTasksForDate();
}

function createDayElement(day, month, year, isOtherMonth) {
    const div = document.createElement('div');
    div.className = 'calendar-day';

    if (isOtherMonth) {
        div.classList.add('other-month');
    }

    // Create proper date
    const actualMonth = (month % 12 + 12) % 12;
    const actualYear = year + Math.floor(month / 12);
    const date = new Date(actualYear, actualMonth, day);
    const dateStr = formatDateKey(date);

    // Check if today
    const today = new Date();
    if (dateStr === formatDateKey(today)) {
        div.classList.add('today');
    }

    // Check if selected
    if (dateStr === formatDateKey(selectedDate)) {
        div.classList.add('selected');
    }

    // Tasks due this date
    const dayTasks = todos.filter(t => {
        if (t.dueDate !== dateStr) return false;
        return isCalendarGroupVisible(getTodoGroupKey(t));
    });
    if (dayTasks.length > 0) {
        div.classList.add('has-tasks');
    }

    const maxVisible = 3;
    const visibleTasks = dayTasks.slice(0, maxVisible);
    const overflowCount = dayTasks.length - visibleTasks.length;

    const taskChips = visibleTasks.map(todo => {
        const category = todo.category || 'other';
        const categoryInfo = getCategoryData(category);
        return `
            <div class="calendar-day-task ${category} ${todo.completed ? 'completed' : ''}" style="${getCategoryBadgeStyle(categoryInfo)}" title="${escapeHtml(todo.text)}">
                ${categoryInfo.icon ? `<span class="calendar-day-task-icon">${categoryInfo.icon}</span>` : ''}
                <span class="calendar-day-task-text">${escapeHtml(todo.text)}</span>
            </div>
        `;
    }).join('');

    const moreLabel = overflowCount > 0 ? `<div class="calendar-day-more">+${overflowCount} more</div>` : '';

    div.innerHTML = `
        <div class="calendar-day-bar"></div>
        <div class="calendar-day-body">
            <div class="calendar-day-head">
                <span class="calendar-day-number">${day}</span>
            </div>
            <div class="calendar-day-tasks-list">
                ${taskChips}
                ${moreLabel}
            </div>
        </div>
    `;

    div.addEventListener('click', () => selectDate(dateStr));

    return div;
}

function selectDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    selectedDate = new Date(year, month - 1, day);
    renderCalendar();
}

function previousMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
}

function renderTasksForDate() {
    const dateStr = formatDateKey(selectedDate);
    const tasksForDate = todos.filter(t => {
        if (t.dueDate !== dateStr) return false;
        return isCalendarGroupVisible(getTodoGroupKey(t));
    });

    const displayDate = parseDateKey(dateStr).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });

    document.getElementById('selectedDateDisplay').textContent = displayDate;

    const container = document.getElementById('tasksForDate');
    if (tasksForDate.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks scheduled for this day.</div>';
    } else {
        container.innerHTML = tasksForDate
            .map(todo => {
                const category = todo.category || 'other';
                const categoryInfo = getCategoryData(category);
                return `
                    <div class="task-item-with-date ${todo.completed ? 'completed' : ''} cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                        <input 
                            type="checkbox" 
                            class="task-checkbox"
                            style="accent-color: ${getTodoGroupColor(todo)};"
                            ${todo.completed ? 'checked' : ''}
                            onchange="toggleTodo(${todo.id})"
                        >
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                                <span class="task-name">${escapeHtml(todo.text)}</span>
                            </div>
                        </div>
                        <div class="task-action-wrap">
                            <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                            <div class="task-more-menu" id="task-menu-${todo.id}">
                                <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                                <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                                <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                                <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }
}

// ==========================================
// Timeline View Functions
// ==========================================

function renderTimeline() {
    const todayKey = formatDateKey(new Date());

    const todosWithDates = todos.filter(t => t.dueDate && !t.completed && t.dueDate >= todayKey).sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
    );

    let html = '';

    if (todosWithDates.length === 0) {
        html = '<div class="empty-state">No tasks. Add some todos to get started!</div>';
    } else {
        // Group by due date
        const groupedByDate = {};
        todosWithDates.forEach(todo => {
            if (!groupedByDate[todo.dueDate]) {
                groupedByDate[todo.dueDate] = [];
            }
            groupedByDate[todo.dueDate].push(todo);
        });

        // Render grouped tasks
        Object.keys(groupedByDate).sort().forEach(dateStr => {
            const date = parseDateKey(dateStr);
            const displayDate = date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const isToday = dateStr === todayKey;

            const tasksForDate = groupedByDate[dateStr];

            html += `
                <div class="date-group">
                    <div class="date-group-header">
                        <span>${isToday ? 'Today' : displayDate}</span>
                        <span class="task-count">${tasksForDate.length}</span>
                    </div>
                    ${tasksForDate.map(todo => {
                        const category = todo.category || 'other';
                        const categoryInfo = getCategoryData(category);
                        return `
                            <div class="task-item-with-date ${todo.completed ? 'completed' : ''} cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                                <input 
                                    type="checkbox" 
                                    class="task-checkbox"
                                    style="accent-color: ${getTodoGroupColor(todo)};"
                                    ${todo.completed ? 'checked' : ''}
                                    onchange="toggleTodo(${todo.id})"
                                >
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                                        <span class="task-name">${escapeHtml(todo.text)}</span>
                                    </div>
                                </div>
                                <div class="task-action-wrap">
                                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                                    <div class="task-more-menu" id="task-menu-${todo.id}">
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        });
    }

    document.getElementById('timelineView').innerHTML = html;
}

// ==========================================
// Completed Tasks Section
// ==========================================

function renderCompleted() {
    const container = document.getElementById('completedList');
    if (!container) return;

    const completedTodos = todos
        .filter(t => t.completed && isCalendarGroupVisible(getTodoGroupKey(t)))
        .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));

    if (completedTodos.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed tasks yet.</div>';
        return;
    }

    container.innerHTML = completedTodos.map(todo => {
        const category = todo.category || 'other';
        const categoryInfo = getCategoryData(category);
        const dueDateStr = todo.dueDate ? formatDisplayDate(todo.dueDate) : 'No date';
        return `
            <div class="task-item-with-date completed cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                <input
                    type="checkbox"
                    class="task-checkbox"
                    style="accent-color: ${getTodoGroupColor(todo)};"
                    checked
                    onchange="toggleTodo(${todo.id})"
                >
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                        <span class="task-name">${escapeHtml(todo.text)}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #999; margin-top: 4px;">${dueDateStr}</div>
                </div>
                <div class="task-action-wrap">
                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                    <div class="task-more-menu" id="task-menu-${todo.id}">
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// Priority Tasks Section
// ==========================================

function renderPriority() {
    const container = document.getElementById('priorityList');
    if (!container) return;

    const priorityTodos = todos
        .filter(t => t.priority && !t.completed && isCalendarGroupVisible(getTodoGroupKey(t)))
        .sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });

    if (priorityTodos.length === 0) {
        container.innerHTML = '<div class="empty-state">No priority tasks yet.</div>';
        return;
    }

    container.innerHTML = priorityTodos.map(todo => {
        const category = todo.category || 'other';
        const categoryInfo = getCategoryData(category);
        const dueDateStr = todo.dueDate ? formatDisplayDate(todo.dueDate) : 'No date';
        return `
            <div class="task-item-with-date ${todo.completed ? 'completed' : ''} cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                <input
                    type="checkbox"
                    class="task-checkbox"
                    style="accent-color: ${getTodoGroupColor(todo)};"
                    ${todo.completed ? 'checked' : ''}
                    onchange="toggleTodo(${todo.id})"
                >
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                        <span class="task-name">${escapeHtml(todo.text)}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #999; margin-top: 4px;">${dueDateStr}</div>
                </div>
                <div class="task-action-wrap">
                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                    <div class="task-more-menu" id="task-menu-${todo.id}">
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// Past Due Tasks Section
// ==========================================

function renderPastDue() {
    const container = document.getElementById('pastDueList');
    if (!container) return;

    const todayKey = formatDateKey(new Date());
    const pastDueTodos = todos
        .filter(t => t.dueDate && !t.completed && t.dueDate < todayKey && isCalendarGroupVisible(getTodoGroupKey(t)))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (pastDueTodos.length === 0) {
        container.innerHTML = '<div class="empty-state">No past due tasks.</div>';
        return;
    }

    container.innerHTML = pastDueTodos.map(todo => {
        const category = todo.category || 'other';
        const categoryInfo = getCategoryData(category);
        const dueDateStr = formatDisplayDate(todo.dueDate);
        return `
            <div class="task-item-with-date overdue cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                <input
                    type="checkbox"
                    class="task-checkbox"
                    style="accent-color: ${getTodoGroupColor(todo)};"
                    onchange="toggleTodo(${todo.id})"
                >
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                        <span class="task-name">${escapeHtml(todo.text)}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #999; margin-top: 4px;">${dueDateStr}</div>
                </div>
                <div class="task-action-wrap">
                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                    <div class="task-more-menu" id="task-menu-${todo.id}">
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// No Due Date Tasks Section
// ==========================================

function renderNoDueDate() {
    const container = document.getElementById('noDueDateList');
    if (!container) return;

    const noDueDateTodos = todos.filter(t => !t.dueDate && !t.completed && isCalendarGroupVisible(getTodoGroupKey(t)));

    if (noDueDateTodos.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks without a due date.</div>';
        return;
    }

    container.innerHTML = noDueDateTodos.map(todo => {
        const category = todo.category || 'other';
        const categoryInfo = getCategoryData(category);
        return `
            <div class="task-item-with-date cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(todo)}; outline-offset: -1px;">
                <input
                    type="checkbox"
                    class="task-checkbox"
                    style="accent-color: ${getTodoGroupColor(todo)};"
                    onchange="toggleTodo(${todo.id})"
                >
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                        <span class="task-name">${escapeHtml(todo.text)}</span>
                    </div>
                </div>
                <div class="task-action-wrap">
                    <button class="task-menu-button" aria-label="More options" data-task-id="${todo.id}">⋮</button>
                    <div class="task-more-menu" id="task-menu-${todo.id}">
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="rename">Rename</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="date">Edit date</button>
                        <button class="task-menu-item" data-task-id="${todo.id}" data-action="priority">${todo.priority ? 'Unmark as Priority' : 'Mark as Priority'}</button>
                        <button class="task-menu-item danger" data-task-id="${todo.id}" data-action="delete">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// Repeating Tasks Section
// ==========================================

function describeRecurrence(task) {
    if (task.type === 'daily') return 'Repeats daily';
    if (task.type === 'weekly') {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `Repeats weekly on ${dayNames[task.day] || 'the same day'}`;
    }
    return 'Repeats';
}

// Tasks belong to the same "set" (e.g. created twice by mistake, or paused and re-added)
// if they share the same text, recurrence, category, and major section.
function getRecurringTaskSetKey(task) {
    return [
        (task.text || '').trim().toLowerCase(),
        task.type,
        task.type === 'weekly' ? task.day : '',
        task.category,
        task.group
    ].join('|');
}

function groupRecurringTaskSets(recurringTasks) {
    const sets = {};
    recurringTasks.filter(task => task && typeof task === 'object').forEach(task => {
        const key = getRecurringTaskSetKey(task);
        if (!sets[key]) sets[key] = [];
        sets[key].push(task);
    });
    return sets;
}

// One representative per set: the active one if any, otherwise the most recently created.
function pickSetRepresentative(setTasks) {
    const active = setTasks.find(t => t.active !== false);
    if (active) return active;
    return setTasks.reduce((latest, t) => (t.id > latest.id ? t : latest), setTasks[0]);
}

function renderRepeatingTasks() {
    const container = document.getElementById('repeatingTasksList');
    if (!container) return;

    let recurringTasks;
    try {
        recurringTasks = loadRecurringTasks();
    } catch (error) {
        console.error('Unable to load recurring tasks for rendering:', error);
        container.innerHTML = '<div class="empty-state">No repeating tasks yet. Add "(daily)" or "(weekly, monday)" to a task to create one.</div>';
        return;
    }

    if (!Array.isArray(recurringTasks) || recurringTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No repeating tasks yet. Add "(daily)" or "(weekly, monday)" to a task to create one.</div>';
        return;
    }

    const representatives = Object.values(groupRecurringTaskSets(recurringTasks)).map(pickSetRepresentative);

    if (representatives.length === 0) {
        container.innerHTML = '<div class="empty-state">No repeating tasks yet. Add "(daily)" or "(weekly, monday)" to a task to create one.</div>';
        return;
    }

    container.innerHTML = representatives.map(task => {
        const category = task.category || 'other';
        const categoryInfo = getCategoryData(category);
        const isActive = task.active !== false;
        return `
            <div class="task-item-with-date ${isActive ? '' : 'paused'} cat-${category}" style="outline: 1.5px solid ${getTodoGroupColor(task)}; outline-offset: -1px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="category-badge ${category}" style="${getCategoryBadgeStyle(categoryInfo)}">${formatCategoryLabel(categoryInfo)}</span>
                        <span class="task-name">${escapeHtml(task.text)}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #999; margin-top: 4px;">${describeRecurrence(task)}${isActive ? '' : ' — paused'}</div>
                </div>
                <div class="task-action-wrap" style="gap: 8px;">
                    <button class="mini-btn" onclick="toggleRecurringTaskActive(${task.id})">${isActive ? 'Pause' : 'Resume'}</button>
                    <button class="mini-btn danger" onclick="removeRecurringTask(${task.id})">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

// Pause/Resume and Remove act on every task in the same set (not just the one
// representative shown), so no duplicate keeps running invisibly in the background.
function toggleRecurringTaskActive(id) {
    const recurringTasks = loadRecurringTasks();
    const task = recurringTasks.find(t => t.id === id);
    if (!task) return;

    const key = getRecurringTaskSetKey(task);
    const nextActive = task.active === false ? true : false;
    recurringTasks.forEach(t => {
        if (getRecurringTaskSetKey(t) === key) {
            t.active = nextActive;
        }
    });
    saveRecurringTasks(recurringTasks);
    renderRepeatingTasks();
}

function removeRecurringTask(id) {
    if (!confirm('Stop this repeating task and delete its upcoming, not-yet-due tasks from the calendar? Past and completed tasks will stay.')) return;

    const recurringTasks = loadRecurringTasks();
    const task = recurringTasks.find(t => t.id === id);
    if (!task) return;

    const key = getRecurringTaskSetKey(task);
    const setIds = recurringTasks.filter(t => getRecurringTaskSetKey(t) === key).map(t => t.id);

    const todayKey = formatDateKey(new Date());
    todos = todos.filter(todo => {
        if (!setIds.includes(todo.recurringId)) return true;
        if (todo.completed) return true;
        if (!todo.dueDate) return true;
        return todo.dueDate < todayKey;
    });
    saveTodos();

    const filtered = recurringTasks.filter(t => getRecurringTaskSetKey(t) !== key);
    saveRecurringTasks(filtered);

    renderTodos();
    renderCalendar();
    renderTimeline();
    renderCompleted();
    renderPriority();
    renderPastDue();
    renderNoDueDate();
    renderRepeatingTasks();
}

function toggleSettingsOverlay(forceOpen) {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !overlay.classList.contains('open');
    overlay.classList.toggle('open', shouldOpen);
}

// ==========================================
// Google Calendar Integration
// ==========================================

const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function authorizeGoogleCalendar() {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
        alert('Google Calendar integration not yet configured.\n\nCurrent features working:\n- Paste lists and create todos\n- Set due dates for tasks\n- View tasks in calendar\n- Timeline view by due date\n- All data saves to browser storage');
        return;
    }

    alert('Google Calendar integration coming soon!\n\nCurrent features:\n- Paste lists from documents\n- Auto-sort into todo items\n- Set due dates for each task\n- Calendar view with task overview\n- Timeline view organized by date\n- Mark tasks complete\n- Automatic browser storage');
}

function checkGoogleCalendarAuth() {
    const authToken = localStorage.getItem('google_auth_token');
    if (authToken) {
        calendarConnected = true;
    }
}

const APP_SETTINGS_KEY = 'smartTodoSettings';

function getAppSettings() {
    const saved = localStorage.getItem(APP_SETTINGS_KEY);
    const defaults = {
        theme: 'default',
        wallpaper: ''
    };

    if (!saved) return defaults;

    try {
        return { ...defaults, ...JSON.parse(saved) };
    } catch (error) {
        console.warn('Unable to load app settings:', error);
        return defaults;
    }
}

function saveAppSettings(settings) {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    scheduleSyncPush();
}

function applyTheme(theme) {
    const root = document.body;
    root.classList.remove('theme-default', 'theme-dark', 'theme-light', 'theme-sunset');
    root.classList.add(`theme-${theme}`);
}

function applyWallpaper() {
    const settings = getAppSettings();
    const preview = document.getElementById('wallpaperPreview');
    if (!preview) return;

    if (settings.wallpaper) {
        preview.style.backgroundImage = `url(${settings.wallpaper})`;
        preview.classList.remove('empty');
        preview.innerHTML = '';
        document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url(${settings.wallpaper})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
    } else {
        preview.style.backgroundImage = 'none';
        preview.classList.add('empty');
        preview.innerHTML = '<span>No wallpaper selected</span>';
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundAttachment = '';
    }
}

function setThemeFromSettings() {
    const settings = getAppSettings();
    const select = document.getElementById('themeSelect');
    if (select) select.value = settings.theme || 'default';
    applyTheme(settings.theme || 'default');
    applyWallpaper();
}

function updateSettingsFromForm() {
    const settings = getAppSettings();

    settings.theme = document.getElementById('themeSelect')?.value || settings.theme;

    saveAppSettings(settings);
    applyTheme(settings.theme);
}

function applyWallpaperFromUpload() {
    const fileInput = document.getElementById('wallpaperUpload');
    const file = fileInput && fileInput.files[0];
    if (!file) {
        alert('Please choose an image first.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        const settings = getAppSettings();
        settings.wallpaper = event.target.result;
        saveAppSettings(settings);
        applyWallpaper();
        const preview = document.getElementById('wallpaperPreview');
        if (preview) {
            preview.style.backgroundImage = `url(${settings.wallpaper})`;
            preview.classList.remove('empty');
            preview.innerHTML = '';
        }
    };
    reader.readAsDataURL(file);
}

function removeWallpaper() {
    const settings = getAppSettings();
    settings.wallpaper = '';
    saveAppSettings(settings);
    applyWallpaper();
    const wallpaperInput = document.getElementById('wallpaperUpload');
    if (wallpaperInput) wallpaperInput.value = '';
}

// ==========================================
// Backup & Restore
// ==========================================

const BACKUP_STORAGE_KEYS = ['todos', 'customCategories', 'groupCategories', 'calendarGroups', 'recurringTasks', APP_SETTINGS_KEY];

function exportAppData() {
    const data = {};
    BACKUP_STORAGE_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) {
            data[key] = value;
        }
    });

    const payload = {
        app: 'smart-todo-list',
        exportedAt: new Date().toISOString(),
        data
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-todo-backup-${formatDateKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importAppData(file) {
    if (!file) {
        alert('Choose a backup file first, then click Restore Backup.');
        return;
    }

    if (!confirm('This will replace your current tasks, categories, and settings with the ones in this backup. Continue?')) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(reader.result);
            const data = payload && typeof payload === 'object' && payload.data ? payload.data : payload;
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid backup file');
            }

            BACKUP_STORAGE_KEYS.forEach(key => {
                if (typeof data[key] === 'string') {
                    localStorage.setItem(key, data[key]);
                }
            });

            alert('Backup restored. The page will now reload.');
            window.location.reload();
        } catch (error) {
            alert('Could not read that file. Make sure it is a backup exported from this app.');
        }
    };
    reader.readAsText(file);
}

// ==========================================
// Cross-Device Sync (Firebase)
// ==========================================
//
// To enable this, fill in FIREBASE_CONFIG below with the values from your own
// free Firebase project (console.firebase.google.com): create a project, add
// a Web App to get this config object, enable Firestore (in Native mode) and
// enable Anonymous sign-in under Authentication > Sign-in method.
//
// Everyone who knows your sync code can read/write that sync group's data, so
// pick something long and private rather than something guessable.
const FIREBASE_CONFIG = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
};

let firestoreDb = null;
let syncEnabled = false;
let syncCode = null;
let syncUnsubscribe = null;
let syncPushTimer = null;

function isFirebaseConfigured() {
    return typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
}

function initFirebaseIfNeeded() {
    if (firestoreDb) return true;
    if (!isFirebaseConfigured()) return false;

    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    firestoreDb = firebase.firestore();
    return true;
}

function getSyncSettings() {
    try {
        return JSON.parse(localStorage.getItem('syncSettings') || '{}');
    } catch (error) {
        return {};
    }
}

function saveSyncSettings(settings) {
    localStorage.setItem('syncSettings', JSON.stringify(settings));
}

function updateSyncStatus(text) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = text;
}

function collectSyncableState() {
    const data = {};
    BACKUP_STORAGE_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
    });
    return data;
}

function applySyncedState(data) {
    BACKUP_STORAGE_KEYS.forEach(key => {
        if (typeof data[key] === 'string') {
            localStorage.setItem(key, data[key]);
        }
    });
}

// Called from every save* function. Batches rapid changes into one write.
function scheduleSyncPush() {
    if (!syncEnabled) return;
    clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(pushSyncState, 800);
}

function pushSyncState() {
    if (!syncEnabled || !firestoreDb || !syncCode) return;

    const now = Date.now();
    const payload = collectSyncableState();
    payload.updatedAt = now;

    const settings = getSyncSettings();
    settings.lastAppliedAt = now;
    saveSyncSettings(settings);

    firestoreDb.collection('syncGroups').doc(syncCode).set(payload)
        .then(() => updateSyncStatus(`Synced — last change sent ${new Date(now).toLocaleTimeString()}`))
        .catch(error => {
            console.error('Sync push failed:', error);
            updateSyncStatus('Sync error — will retry on next change');
        });
}

function startSyncListener() {
    if (!firestoreDb || !syncCode) return;
    if (syncUnsubscribe) syncUnsubscribe();

    syncUnsubscribe = firestoreDb.collection('syncGroups').doc(syncCode)
        .onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const settings = getSyncSettings();
            const lastApplied = settings.lastAppliedAt || 0;

            if (!data.updatedAt || data.updatedAt <= lastApplied) return;

            applySyncedState(data);
            settings.lastAppliedAt = data.updatedAt;
            saveSyncSettings(settings);
            window.location.reload();
        }, error => {
            console.error('Sync listener error:', error);
            updateSyncStatus('Sync connection error');
        });
}

function connectSync(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) {
        alert('Enter a sync code first.');
        return;
    }

    if (!initFirebaseIfNeeded()) {
        alert('Sync isn\'t configured yet — this app needs a Firebase project connected before it can sync.');
        return;
    }

    updateSyncStatus('Connecting…');

    firebase.auth().signInAnonymously()
        .then(() => firestoreDb.collection('syncGroups').doc(trimmed).get())
        .then(docSnap => {
            syncCode = trimmed;
            syncEnabled = true;
            const settings = getSyncSettings();
            settings.code = trimmed;
            settings.enabled = true;
            saveSyncSettings(settings);

            if (!docSnap.exists) {
                pushSyncState();
                updateSyncStatus('Connected — this device is the starting point');
            } else {
                updateSyncStatus('Connected — pulling latest…');
            }

            startSyncListener();
        })
        .catch(error => {
            console.error('Sync connect failed:', error);
            updateSyncStatus('Could not connect');
            alert('Could not connect to sync. Check your Firebase setup and try again.');
        });
}

function disconnectSync() {
    syncEnabled = false;
    if (syncUnsubscribe) {
        syncUnsubscribe();
        syncUnsubscribe = null;
    }
    const settings = getSyncSettings();
    settings.enabled = false;
    saveSyncSettings(settings);
    updateSyncStatus('Not connected');
}

function autoReconnectSync() {
    const settings = getSyncSettings();
    if (!settings.enabled || !settings.code) return;
    if (!initFirebaseIfNeeded()) return;

    const codeInput = document.getElementById('syncCodeInput');
    if (codeInput) codeInput.value = settings.code;

    connectSync(settings.code);
}

document.addEventListener('DOMContentLoaded', () => {
    setThemeFromSettings();

    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const closeSettingsOverlay = document.getElementById('closeSettingsOverlay');
    const settingsOverlay = document.getElementById('settingsOverlay');

    if (settingsToggleBtn) {
        settingsToggleBtn.addEventListener('click', () => toggleSettingsOverlay());
    }

    if (closeSettingsOverlay) {
        closeSettingsOverlay.addEventListener('click', () => toggleSettingsOverlay(false));
    }

    document.addEventListener('click', (event) => {
        if (!settingsOverlay) return;
        const clickedInsideOverlay = settingsOverlay.contains(event.target);
        const clickedToggle = settingsToggleBtn && settingsToggleBtn.contains(event.target);
        if (!clickedInsideOverlay && !clickedToggle) {
            toggleSettingsOverlay(false);
        }
    });

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.addEventListener('change', updateSettingsFromForm);
    }

    applyWallpaper();
    autoReconnectSync();
});

// Registers the offline/installable app shell. Silently does nothing if the
// page isn't served over http(s) (e.g. opened directly as a local file), since
// browsers don't allow service workers on file:// origins.
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.warn('Service worker registration failed:', error);
        });
    });
}
