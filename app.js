(function() {
    'use strict';

    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { tg.ready(); tg.expand(); }

    var DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    var DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PRIORITY_EMOJI = {0: '⚪', 1: '🟢', 2: '🟡', 3: '🔴'};
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'По дням' };
    var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    var todayIndex = (new Date().getDay() + 6) % 7;
    var currentDay = todayIndex;
    var currentView = 'tasks';
    var selectedDate = formatDate(new Date());
    
    // Приоритеты
    var selectedPriority = 0;
    var selectedCalendarPriority = 0;
    var selectedRepeatPriority = 0;
    
    // Типы времени
    var selectedTimeType = 'none';
    var selectedCalendarTimeType = 'none';
    var selectedRepeatTimeType = 'none';
    
    var selectedRepeatType = 'daily';
    var selectedDays = [];
    var confirmCallback = null;
    var priorityTaskId = null;
    var prioritySource = 'tasks';

    // ========== УТИЛИТЫ ==========
    
    function formatDate(date) {
        var d = new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    
    function formatDateFull(dateStr) {
        var parts = dateStr.split('-');
        return parseInt(parts[2]) + ' ' + MONTHS[parseInt(parts[1]) - 1] + ' ' + parts[0];
    }
    
    function getWeekId() {
        var now = new Date();
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return now.getFullYear() + '_' + week;
    }

    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function formatTimeDisplay(task) {
        if (task.timeStart && task.timeEnd) {
            return task.timeStart + ' — ' + task.timeEnd;
        } else if (task.time) {
            return task.time;
        }
        return null;
    }

    // ========== ХРАНИЛИЩЕ ==========
    
    function loadWeekTasks() {
        try {
            var data = localStorage.getItem('weekly_tasks_' + getWeekId());
            var tasks = data ? JSON.parse(data) : {};
            for (var i = 0; i < 7; i++) if (!tasks[i]) tasks[i] = [];
            return tasks;
        } catch(e) {
            return {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
        }
    }

    function saveWeekTasks(tasks) {
        localStorage.setItem('weekly_tasks_' + getWeekId(), JSON.stringify(tasks));
    }

    function loadDateTasks(dateStr) {
        try {
            var data = localStorage.getItem('calendar_' + dateStr);
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }

    function saveDateTasks(dateStr, tasks) {
        if (tasks.length === 0) {
            localStorage.removeItem('calendar_' + dateStr);
        } else {
            localStorage.setItem('calendar_' + dateStr, JSON.stringify(tasks));
        }
    }

    function loadRepeats() {
        try {
            var data = localStorage.getItem('weekly_repeats_v3');
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }

    function saveRepeats(repeats) {
        localStorage.setItem('weekly_repeats_v3', JSON.stringify(repeats));
    }

    // ========== ПОВТОРЫ ==========
    
    function getRepeatDays(r) {
        if (r.type === 'daily') return [0,1,2,3,4,5,6];
        if (r.type === 'weekdays') return [0,1,2,3,4];
        if (r.type === 'weekends') return [5,6];
        return r.days || [];
    }
    
    function applyRepeats() {
        var tasks = loadWeekTasks();
        var repeats = loadRepeats();
        var weekId = getWeekId();
        var changed = false;

        repeats.forEach(function(r) {
            if (!r.active || r['applied_' + weekId]) return;
            
            getRepeatDays(r).forEach(function(day) {
                if (!tasks[day].some(function(t) { return t.repeatId === r.id; })) {
                    tasks[day].push({
                        id: generateId(),
                        text: r.text,
                        time: r.time || null,
                        timeStart: r.timeStart || null,
                        timeEnd: r.timeEnd || null,
                        priority: r.priority || 0,
                        done: false,
                        repeatId: r.id
                    });
                    changed = true;
                }
            });
            
            r['applied_' + weekId] = true;
        });

        if (changed) {
            saveWeekTasks(tasks);
            saveRepeats(repeats);
        }
        
        return tasks;
    }

    // ========== UI ==========
    
    function showToast(msg, type) {
        var t = document.querySelector('.toast');
        if (t) t.remove();
        
        var toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' ' + type : '');
        toast.textContent = msg;
        document.body.appendChild(toast);
        
        setTimeout(function() { toast.classList.add('show'); }, 10);
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        }, 2500);
    }

    function haptic() {
        if (tg && tg.HapticFeedback) {
            try { tg.HapticFeedback.impactOccurred('light'); } catch(e) {}
        }
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function openModal(id) {
        var m = document.getElementById(id);
        if (m) { m.classList.add('active'); haptic(); }
    }

    function closeModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('active');
        
        var form = m.querySelector('form');
        if (form) form.reset();
        
        // Сброс состояний
        if (id === 'modal-add') {
            selectedPriority = 0;
            selectedTimeType = 'none';
            updatePriorityButtons('priority-select', 0);
            updateTimeTypeButtons('time-type-select', 'none');
            updateTimeFields('', 'none');
        }
        if (id === 'modal-add-calendar') {
            selectedCalendarPriority = 0;
            selectedCalendarTimeType = 'none';
            updatePriorityButtons('calendar-priority-select', 0);
            updateTimeTypeButtons('calendar-time-type-select', 'none');
            updateTimeFields('calendar-', 'none');
        }
        if (id === 'modal-repeat') {
            selectedRepeatPriority = 0;
            selectedRepeatTimeType = 'none';
            selectedRepeatType = 'daily';
            selectedDays = [];
            updatePriorityButtons('repeat-priority-select', 0);
            updateTimeTypeButtons('repeat-time-type-select', 'none');
            updateTimeFields('repeat-', 'none');
            updateRepeatTypeButtons('daily');
            updateDaysButtons([]);
        }
    }

    function updatePriorityButtons(containerId, priority) {
        var c = document.getElementById(containerId);
        if (!c) return;
        c.querySelectorAll('.priority-btn').forEach(function(btn) {
            btn.classList.toggle('active', parseInt(btn.dataset.priority) === priority);
        });
    }
    
    function updateTimeTypeButtons(containerId, type) {
        var c = document.getElementById(containerId);
        if (!c) return;
        c.querySelectorAll('.time-type-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
    }
    
    function updateTimeFields(prefix, type) {
        var single = document.getElementById(prefix + 'time-single-group');
        var interval = document.getElementById(prefix + 'time-interval-group');
        
        if (single) single.style.display = type === 'single' ? 'block' : 'none';
        if (interval) interval.style.display = type === 'interval' ? 'block' : 'none';
    }

    function updateRepeatTypeButtons(type) {
        var c = document.getElementById('repeat-type-select');
        if (!c) return;
        c.querySelectorAll('.repeat-type-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        var dg = document.getElementById('days-select-group');
        if (dg) dg.style.display = type === 'weekly' ? 'block' : 'none';
    }

    function updateDaysButtons(days) {
        var c = document.getElementById('days-select');
        if (!c) return;
        c.querySelectorAll('.day-btn').forEach(function(btn) {
            btn.classList.toggle('active', days.indexOf(parseInt(btn.dataset.day)) !== -1);
        });
    }

    function updateStats() {
        var tasks = loadWeekTasks();
        var total = 0, done = 0;
        for (var d = 0; d < 7; d++) {
            total += tasks[d].length;
            done += tasks[d].filter(function(t) { return t.done; }).length;
        }
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        var fill = document.getElementById('stats-fill');
        var text = document.getElementById('stats-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = done + '/' + total;
    }

    function updateTabs() {
        var tasks = loadWeekTasks();
        document.querySelectorAll('.tabs .tab').forEach(function(tab) {
            var day = parseInt(tab.dataset.day);
            var hasTasks = tasks[day].some(function(t) { return !t.done; });
            tab.classList.toggle('active', day === currentDay);
            tab.classList.toggle('has-tasks', hasTasks);
            tab.classList.toggle('today', day === todayIndex);
        });
    }

    // ========== РЕНДЕР ==========

    function renderTaskCard(task, source) {
        var timeDisplay = formatTimeDisplay(task);
        var isInterval = task.timeStart && task.timeEnd;
        
        var html = '<div class="task-card ' + (task.done ? 'done' : '') + '" ';
        html += 'data-id="' + task.id + '" data-priority="' + (task.priority || 0) + '" data-source="' + source + '">';
        html += '<div class="task-checkbox ' + (task.done ? 'checked' : '') + '" data-id="' + task.id + '"></div>';
        html += '<div class="task-content"><div class="task-meta">';
        
        if (timeDisplay) {
            html += '<span class="task-time' + (isInterval ? ' interval' : '') + '">⏰ ' + timeDisplay + '</span>';
        }
        
        html += '<span class="task-priority" data-id="' + task.id + '">' + PRIORITY_EMOJI[task.priority || 0] + '</span>';
        
        if (task.repeatId) {
            html += '<span class="task-repeat">🔄</span>';
        }
        
        html += '</div><div class="task-text">' + escapeHtml(task.text) + '</div></div>';
        html += '<button class="task-delete" data-id="' + task.id + '">×</button></div>';
        
        return html;
    }

    function sortTasks(tasks) {
        return tasks.sort(function(a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            if (b.priority !== a.priority) return b.priority - a.priority;
            var aTime = a.timeStart || a.time || '';
            var bTime = b.timeStart || b.time || '';
            return aTime.localeCompare(bTime);
        });
    }

    function renderWeekTasks() {
        var tasks = sortTasks(applyRepeats()[currentDay] || []);
        var list = document.getElementById('tasks-list');
        var empty = document.getElementById('empty-state');
        var title = document.getElementById('day-title');

        if (title) title.textContent = DAYS[currentDay];

        if (tasks.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
        } else {
            if (empty) empty.classList.remove('show');
            if (list) list.innerHTML = tasks.map(function(t) { return renderTaskCard(t, 'week'); }).join('');
        }

        updateStats();
        updateTabs();
    }

    function renderDateTasks() {
        var tasks = sortTasks(loadDateTasks(selectedDate));
        var list = document.getElementById('calendar-tasks-list');
        var empty = document.getElementById('empty-calendar');
        var title = document.getElementById('calendar-title');

        if (title) title.textContent = formatDateFull(selectedDate);

        if (tasks.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
        } else {
            if (empty) empty.classList.remove('show');
            if (list) list.innerHTML = tasks.map(function(t) { return renderTaskCard(t, 'calendar'); }).join('');
        }
    }

    function renderRepeats() {
        var repeats = loadRepeats();
        var list = document.getElementById('repeats-list');
        var empty = document.getElementById('empty-repeats');

        if (repeats.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
            return;
        }

        if (empty) empty.classList.remove('show');

        var html = '';
        repeats.forEach(function(r) {
            var daysToShow = getRepeatDays(r);
            var timeDisplay = r.timeStart && r.timeEnd ? r.timeStart + ' — ' + r.timeEnd : (r.time || null);
            var isInterval = r.timeStart && r.timeEnd;

            html += '<div class="repeat-card ' + (r.active ? '' : 'inactive') + '" data-id="' + r.id + '">';
            html += '<div class="repeat-header">';
            html += '<span class="repeat-priority">' + PRIORITY_EMOJI[r.priority || 0] + '</span>';
            html += '<span class="repeat-text">' + escapeHtml(r.text) + '</span>';
            html += '</div><div class="repeat-info">';
            
            if (timeDisplay) {
                html += '<span class="repeat-badge' + (isInterval ? ' interval' : '') + '">⏰ ' + timeDisplay + '</span>';
            }
            
            html += '<span class="repeat-badge">📅 ' + (REPEAT_LABELS[r.type] || r.type) + '</span>';
            html += '</div><div class="repeat-days-preview">';
            
            for (var d = 0; d < 7; d++) {
                html += '<div class="repeat-day-dot ' + (daysToShow.indexOf(d) !== -1 ? 'active' : '') + '">' + DAYS_SHORT[d] + '</div>';
            }
            
            html += '</div><div class="repeat-actions">';
            html += '<button class="btn-toggle" data-id="' + r.id + '">' + (r.active ? '⏸ Пауза' : '▶️ Вкл') + '</button>';
            html += '<button class="btn-remove" data-id="' + r.id + '">🗑</button>';
            html += '</div></div>';
        });

        if (list) list.innerHTML = html;
    }

    // ========== ДЕЙСТВИЯ ==========

    function toggleWeekTask(id) {
        var tasks = loadWeekTasks();
        var task = tasks[currentDay].find(function(t) { return t.id === id; });
        if (task) {
            task.done = !task.done;
            saveWeekTasks(tasks);
            showToast(task.done ? '✓ Выполнено!' : 'Возвращено', 'success');
            renderWeekTasks();
        }
    }

    function deleteWeekTask(id) {
        var tasks = loadWeekTasks();
        tasks[currentDay] = tasks[currentDay].filter(function(t) { return t.id !== id; });
        saveWeekTasks(tasks);
        showToast('Удалено', 'success');
        renderWeekTasks();
        closeModal('modal-confirm');
    }

    function addWeekTask(text, time, timeStart, timeEnd, priority) {
        if (!text.trim()) return;
        var tasks = loadWeekTasks();
        tasks[currentDay].push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            timeStart: timeStart || null,
            timeEnd: timeEnd || null,
            priority: priority || 0,
            done: false
        });
        saveWeekTasks(tasks);
        showToast('Добавлено!', 'success');
        renderWeekTasks();
    }

    function toggleDateTask(id) {
        var tasks = loadDateTasks(selectedDate);
        var task = tasks.find(function(t) { return t.id === id; });
        if (task) {
            task.done = !task.done;
            saveDateTasks(selectedDate, tasks);
            showToast(task.done ? '✓ Выполнено!' : 'Возвращено', 'success');
            renderDateTasks();
        }
    }

    function deleteDateTask(id) {
        var tasks = loadDateTasks(selectedDate);
        tasks = tasks.filter(function(t) { return t.id !== id; });
        saveDateTasks(selectedDate, tasks);
        showToast('Удалено', 'success');
        renderDateTasks();
        closeModal('modal-confirm');
    }

    function addDateTask(text, time, timeStart, timeEnd, priority) {
        if (!text.trim()) return;
        var tasks = loadDateTasks(selectedDate);
        tasks.push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            timeStart: timeStart || null,
            timeEnd: timeEnd || null,
            priority: priority || 0,
            done: false
        });
        saveDateTasks(selectedDate, tasks);
        showToast('Добавлено!', 'success');
        renderDateTasks();
    }

    function toggleRepeat(id) {
        var repeats = loadRepeats();
        var r = repeats.find(function(x) { return x.id === id; });
        if (r) {
            r.active = !r.active;
            saveRepeats(repeats);
            showToast(r.active ? 'Включено' : 'На паузе', 'success');
            renderRepeats();
        }
    }

    function deleteRepeat(id) {
        var repeats = loadRepeats().filter(function(r) { return r.id !== id; });
        saveRepeats(repeats);
        
        // Удаляем задачи
        var tasks = loadWeekTasks();
        for (var d = 0; d < 7; d++) {
            tasks[d] = tasks[d].filter(function(t) { return t.repeatId !== id; });
        }
        saveWeekTasks(tasks);
        
        showToast('Повтор удалён', 'success');
        renderRepeats();
        renderWeekTasks();
        closeModal('modal-confirm');
    }

    function createRepeat(text, time, timeStart, timeEnd, priority, type, days) {
        if (!text.trim()) return false;
        if (type === 'weekly' && days.length === 0) {
            showToast('Выберите дни', 'error');
            return false;
        }
        
        var repeats = loadRepeats();
        repeats.push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            timeStart: timeStart || null,
            timeEnd: timeEnd || null,
            priority: priority || 0,
            type: type,
            days: type === 'weekly' ? days.slice() : [],
            active: true
        });
        saveRepeats(repeats);
        
        showToast('Повтор создан!', 'success');
        applyRepeats();
        renderRepeats();
        renderWeekTasks();
        return true;
    }

    function clearDay(source) {
        var name = source === 'calendar' ? formatDateFull(selectedDate) : DAYS[currentDay];
        document.getElementById('confirm-text').textContent = 'Очистить ' + name + '?';
        
        confirmCallback = function() {
            if (source === 'calendar') {
                saveDateTasks(selectedDate, []);
                renderDateTasks();
            } else {
                var tasks = loadWeekTasks();
                tasks[currentDay] = [];
                saveWeekTasks(tasks);
                renderWeekTasks();
            }
            showToast('Очищено', 'success');
            closeModal('modal-confirm');
        };
        
        openModal('modal-confirm');
    }

    function changePriority(id, priority, source) {
        if (source === 'calendar') {
            var tasks = loadDateTasks(selectedDate);
            var task = tasks.find(function(t) { return t.id === id; });
            if (task) {
                task.priority = priority;
                saveDateTasks(selectedDate, tasks);
                renderDateTasks();
            }
        } else {
            var weekTasks = loadWeekTasks();
            var wTask = weekTasks[currentDay].find(function(t) { return t.id === id; });
            if (wTask) {
                wTask.priority = priority;
                saveWeekTasks(weekTasks);
                renderWeekTasks();
            }
        }
        closeModal('modal-priority');
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    
    function init() {
        var datePicker = document.getElementById('calendar-date');
        if (datePicker) datePicker.value = selectedDate;
        
        renderWeekTasks();
        renderDateTasks();
        renderRepeats();

        // NAV TABS
        document.querySelectorAll('.nav-tab').forEach(function(tab) {
            tab.onclick = function() {
                currentView = this.dataset.view;
                document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
                document.getElementById('view-' + currentView).classList.add('active');
                haptic();
            };
        });

        // DAY TABS
        document.querySelectorAll('.tabs .tab').forEach(function(tab) {
            tab.onclick = function() {
                currentDay = parseInt(this.dataset.day);
                haptic();
                renderWeekTasks();
            };
        });

        // DATE PICKER
        if (datePicker) {
            datePicker.onchange = function() {
                selectedDate = this.value;
                renderDateTasks();
            };
        }

        // FAB
        document.getElementById('btn-add').onclick = function() {
            haptic();
            if (currentView === 'tasks') openModal('modal-add');
            else if (currentView === 'calendar') openModal('modal-add-calendar');
            else if (currentView === 'repeats') openModal('modal-repeat');
        };

        // CLEAR BUTTONS
        document.getElementById('btn-clear-day').onclick = function() { clearDay('week'); };
        document.getElementById('btn-clear-date').onclick = function() { clearDay('calendar'); };

        // CLOSE MODALS
        document.querySelectorAll('.modal-close, .btn-cancel').forEach(function(btn) {
            btn.onclick = function() { closeModal(this.dataset.modal); };
        });

        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.onclick = function(e) { if (e.target === this) closeModal(this.id); };
        });

        // TIME TYPE BUTTONS
        function setupTimeType(containerId, prefix, setter) {
            var c = document.getElementById(containerId);
            if (c) {
                c.querySelectorAll('.time-type-btn').forEach(function(btn) {
                    btn.onclick = function(e) {
                        e.preventDefault();
                        var type = this.dataset.type;
                        setter(type);
                        updateTimeTypeButtons(containerId, type);
                        updateTimeFields(prefix, type);
                        haptic();
                    };
                });
            }
        }
        
        setupTimeType('time-type-select', '', function(t) { selectedTimeType = t; });
        setupTimeType('calendar-time-type-select', 'calendar-', function(t) { selectedCalendarTimeType = t; });
        setupTimeType('repeat-time-type-select', 'repeat-', function(t) { selectedRepeatTimeType = t; });

        // PRIORITY BUTTONS
        function setupPriority(containerId, setter) {
            var c = document.getElementById(containerId);
            if (c) {
                c.querySelectorAll('.priority-btn').forEach(function(btn) {
                    btn.onclick = function(e) {
                        e.preventDefault();
                        var p = parseInt(this.dataset.priority);
                        setter(p);
                        updatePriorityButtons(containerId, p);
                        haptic();
                    };
                });
            }
        }
        
        setupPriority('priority-select', function(p) { selectedPriority = p; });
        setupPriority('calendar-priority-select', function(p) { selectedCalendarPriority = p; });
        setupPriority('repeat-priority-select', function(p) { selectedRepeatPriority = p; });

        // REPEAT TYPE
        var rts = document.getElementById('repeat-type-select');
        if (rts) {
            rts.querySelectorAll('.repeat-type-btn').forEach(function(btn) {
                btn.onclick = function(e) {
                    e.preventDefault();
                    selectedRepeatType = this.dataset.type;
                    updateRepeatTypeButtons(selectedRepeatType);
                    haptic();
                };
            });
        }

        // DAYS SELECT
        var ds = document.getElementById('days-select');
        if (ds) {
            ds.querySelectorAll('.day-btn').forEach(function(btn) {
                btn.onclick = function(e) {
                    e.preventDefault();
                    var d = parseInt(this.dataset.day);
                    var idx = selectedDays.indexOf(d);
                    if (idx === -1) selectedDays.push(d);
                    else selectedDays.splice(idx, 1);
                    updateDaysButtons(selectedDays);
                    haptic();
                };
            });
        }

        // FORMS
        document.getElementById('form-add-task').onsubmit = function(e) {
            e.preventDefault();
            var text = document.getElementById('task-text').value;
            var time = null, timeStart = null, timeEnd = null;
            
            if (selectedTimeType === 'single') {
                time = document.getElementById('task-time').value || null;
            } else if (selectedTimeType === 'interval') {
                timeStart = document.getElementById('task-time-start').value || null;
                timeEnd = document.getElementById('task-time-end').value || null;
            }
            
            if (text.trim()) {
                addWeekTask(text, time, timeStart, timeEnd, selectedPriority);
                closeModal('modal-add');
            }
        };

        document.getElementById('form-add-calendar-task').onsubmit = function(e) {
            e.preventDefault();
            var text = document.getElementById('calendar-task-text').value;
            var time = null, timeStart = null, timeEnd = null;
            
            if (selectedCalendarTimeType === 'single') {
                time = document.getElementById('calendar-task-time').value || null;
            } else if (selectedCalendarTimeType === 'interval') {
                timeStart = document.getElementById('calendar-task-time-start').value || null;
                timeEnd = document.getElementById('calendar-task-time-end').value || null;
            }
            
            if (text.trim()) {
                addDateTask(text, time, timeStart, timeEnd, selectedCalendarPriority);
                closeModal('modal-add-calendar');
            }
        };

        document.getElementById('form-add-repeat').onsubmit = function(e) {
            e.preventDefault();
            var text = document.getElementById('repeat-text').value;
            var time = null, timeStart = null, timeEnd = null;
            
            if (selectedRepeatTimeType === 'single') {
                time = document.getElementById('repeat-time').value || null;
            } else if (selectedRepeatTimeType === 'interval') {
                timeStart = document.getElementById('repeat-time-start').value || null;
                timeEnd = document.getElementById('repeat-time-end').value || null;
            }
            
            if (createRepeat(text, time, timeStart, timeEnd, selectedRepeatPriority, selectedRepeatType, selectedDays)) {
                closeModal('modal-repeat');
            }
        };

        // PRIORITY CHANGE
        var pc = document.getElementById('priority-change');
        if (pc) {
            pc.querySelectorAll('.priority-option').forEach(function(btn) {
                btn.onclick = function() {
                    changePriority(priorityTaskId, parseInt(this.dataset.priority), prioritySource);
                };
            });
        }

        // CONFIRM
        document.getElementById('btn-confirm-ok').onclick = function() {
            if (confirmCallback) confirmCallback();
            confirmCallback = null;
        };

        // TASK LIST DELEGATION
        function setupTaskList(listId, source, toggle, del) {
            var list = document.getElementById(listId);
            if (list) {
                list.onclick = function(e) {
                    var id = e.target.dataset.id;
                    if (e.target.classList.contains('task-checkbox')) {
                        toggle(id);
                    } else if (e.target.classList.contains('task-delete')) {
                        document.getElementById('confirm-text').textContent = 'Удалить задачу?';
                        confirmCallback = function() { del(id); };
                        openModal('modal-confirm');
                    } else if (e.target.classList.contains('task-priority')) {
                        priorityTaskId = id;
                        prioritySource = source;
                        openModal('modal-priority');
                    }
                };
            }
        }
        
        setupTaskList('tasks-list', 'week', toggleWeekTask, deleteWeekTask);
        setupTaskList('calendar-tasks-list', 'calendar', toggleDateTask, deleteDateTask);

        // REPEATS LIST
        var rl = document.getElementById('repeats-list');
        if (rl) {
            rl.onclick = function(e) {
                var id = e.target.dataset.id;
                if (e.target.classList.contains('btn-toggle')) {
                    toggleRepeat(id);
                } else if (e.target.classList.contains('btn-remove')) {
                    document.getElementById('confirm-text').textContent = 'Удалить повтор и все связанные задачи?';
                    confirmCallback = function() { deleteRepeat(id); };
                    openModal('modal-confirm');
                }
            };
        }

        // KEYBOARD
        document.onkeydown = function(e) {
            if (e.key === 'Escape') {
                ['modal-add', 'modal-add-calendar', 'modal-repeat', 'modal-confirm', 'modal-priority'].forEach(closeModal);
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
