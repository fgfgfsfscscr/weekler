(function() {
    'use strict';

    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { 
        tg.ready(); 
        tg.expand(); 
    }

    // ========== КОНСТАНТЫ ==========
    var DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    var DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PRIORITY_EMOJI = {0: '⚪', 1: '🟢', 2: '🟡', 3: '🔴'};
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'По дням' };
    var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    // ========== СОСТОЯНИЕ ==========
    var todayIndex = (function() {
        var d = new Date().getDay();
        return d === 0 ? 6 : d - 1;
    })();
    
    var currentDay = todayIndex;
    var currentView = 'tasks';
    var selectedDate = formatDate(new Date());
    var selectedPriority = 0;
    var selectedRepeatPriority = 0;
    var selectedCalendarPriority = 0;
    var selectedRepeatType = 'daily';
    var selectedDays = [];
    var confirmCallback = null;
    var priorityTaskId = null;
    var prioritySource = 'tasks'; // 'tasks' или 'calendar'

    // ========== УТИЛИТЫ ==========
    
    function formatDate(date) {
        var d = new Date(date);
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }
    
    function formatDateRu(dateStr) {
        var parts = dateStr.split('-');
        var day = parseInt(parts[2]);
        var month = parseInt(parts[1]) - 1;
        var year = parts[0];
        return day + ' ' + MONTHS[month] + ' ' + year;
    }
    
    function getWeekId() {
        var now = new Date();
        var year = now.getFullYear();
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return year + '_' + week;
    }

    function generateId() {
        return 'id_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ========== ХРАНИЛИЩЕ: НЕДЕЛЬНЫЕ ЗАДАЧИ ==========
    
    function getWeekStorageKey() {
        return 'weekly_tasks_' + getWeekId();
    }

    function loadWeekTasks() {
        try {
            var data = localStorage.getItem(getWeekStorageKey());
            var tasks = data ? JSON.parse(data) : null;
            if (!tasks) {
                tasks = {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
            }
            for (var i = 0; i < 7; i++) {
                if (!tasks[i]) tasks[i] = [];
            }
            return tasks;
        } catch(e) {
            return {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
        }
    }

    function saveWeekTasks(tasks) {
        try {
            localStorage.setItem(getWeekStorageKey(), JSON.stringify(tasks));
        } catch(e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    // ========== ХРАНИЛИЩЕ: ЗАДАЧИ ПО ДАТАМ ==========
    
    function getDateStorageKey(dateStr) {
        return 'calendar_tasks_' + dateStr;
    }

    function loadDateTasks(dateStr) {
        try {
            var data = localStorage.getItem(getDateStorageKey(dateStr));
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }

    function saveDateTasks(dateStr, tasks) {
        try {
            if (tasks.length === 0) {
                localStorage.removeItem(getDateStorageKey(dateStr));
            } else {
                localStorage.setItem(getDateStorageKey(dateStr), JSON.stringify(tasks));
            }
        } catch(e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    // ========== ХРАНИЛИЩЕ: ПОВТОРЫ ==========

    function loadRepeats() {
        try {
            var data = localStorage.getItem('weekly_repeats_v2');
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }

    function saveRepeats(repeats) {
        try {
            localStorage.setItem('weekly_repeats_v2', JSON.stringify(repeats));
        } catch(e) {
            console.error('Ошибка сохранения повторов:', e);
        }
    }

    // ========== СИСТЕМА ПОВТОРОВ ==========
    
    function getRepeatDays(repeat) {
        switch(repeat.type) {
            case 'daily': return [0, 1, 2, 3, 4, 5, 6];
            case 'weekdays': return [0, 1, 2, 3, 4];
            case 'weekends': return [5, 6];
            case 'weekly': return repeat.days || [];
            default: return [];
        }
    }
    
    function applyRepeats() {
        var tasks = loadWeekTasks();
        var repeats = loadRepeats();
        var weekId = getWeekId();
        var changed = false;

        for (var i = 0; i < repeats.length; i++) {
            var repeat = repeats[i];
            if (!repeat.active) continue;
            
            var appliedKey = 'applied_' + weekId;
            if (repeat[appliedKey]) continue;

            var daysToAdd = getRepeatDays(repeat);

            for (var j = 0; j < daysToAdd.length; j++) {
                var day = daysToAdd[j];
                if (!tasks[day]) tasks[day] = [];
                
                var exists = false;
                for (var k = 0; k < tasks[day].length; k++) {
                    if (tasks[day][k].repeatId === repeat.id) {
                        exists = true;
                        break;
                    }
                }

                if (!exists) {
                    tasks[day].push({
                        id: generateId(),
                        text: repeat.text,
                        time: repeat.time || null,
                        priority: repeat.priority || 0,
                        done: false,
                        repeatId: repeat.id
                    });
                    changed = true;
                }
            }
            
            repeat[appliedKey] = true;
        }

        if (changed) {
            saveWeekTasks(tasks);
            saveRepeats(repeats);
        }
        
        return tasks;
    }
    
    function removeRepeatTasks(repeatId) {
        // Удаляем задачи из текущей недели
        var tasks = loadWeekTasks();
        var changed = false;
        
        for (var day = 0; day < 7; day++) {
            var dayTasks = tasks[day] || [];
            var newTasks = [];
            
            for (var i = 0; i < dayTasks.length; i++) {
                if (dayTasks[i].repeatId !== repeatId) {
                    newTasks.push(dayTasks[i]);
                } else {
                    changed = true;
                }
            }
            
            tasks[day] = newTasks;
        }
        
        if (changed) {
            saveWeekTasks(tasks);
        }
        
        return changed;
    }

    // ========== UI УТИЛИТЫ ==========
    
    function showToast(message, type) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        var toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' ' + type : '');
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(function() { toast.classList.add('show'); }, 10);
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        }, 2500);
    }

    function haptic(type) {
        if (!tg || !tg.HapticFeedback) return;
        try {
            if (type === 'light') tg.HapticFeedback.impactOccurred('light');
            else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
            else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
            else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        } catch(e) {}
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function openModal(id) {
        var modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            haptic('light');
        }
    }

    function closeModal(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        
        modal.classList.remove('active');
        
        if (id === 'modal-add') {
            var form = document.getElementById('form-add-task');
            if (form) form.reset();
            selectedPriority = 0;
            updatePriorityButtons('priority-select', 0);
        }
        
        if (id === 'modal-add-calendar') {
            var form2 = document.getElementById('form-add-calendar-task');
            if (form2) form2.reset();
            selectedCalendarPriority = 0;
            updatePriorityButtons('calendar-priority-select', 0);
        }
        
        if (id === 'modal-repeat') {
            var form3 = document.getElementById('form-add-repeat');
            if (form3) form3.reset();
            selectedRepeatPriority = 0;
            selectedRepeatType = 'daily';
            selectedDays = [];
            updatePriorityButtons('repeat-priority-select', 0);
            updateRepeatTypeButtons('daily');
            updateDaysButtons([]);
        }
    }

    function updatePriorityButtons(containerId, priority) {
        var container = document.getElementById(containerId);
        if (!container) return;
        
        var btns = container.querySelectorAll('.priority-btn');
        btns.forEach(function(btn) {
            btn.classList.remove('active');
            if (parseInt(btn.getAttribute('data-priority')) === priority) {
                btn.classList.add('active');
            }
        });
    }

    function updateRepeatTypeButtons(type) {
        var container = document.getElementById('repeat-type-select');
        if (!container) return;
        
        container.querySelectorAll('.repeat-type-btn').forEach(function(btn) {
            btn.classList.remove('active');
            if (btn.getAttribute('data-type') === type) {
                btn.classList.add('active');
            }
        });
        
        var daysGroup = document.getElementById('days-select-group');
        if (daysGroup) {
            daysGroup.style.display = type === 'weekly' ? 'block' : 'none';
        }
    }

    function updateDaysButtons(days) {
        var container = document.getElementById('days-select');
        if (!container) return;
        
        container.querySelectorAll('.day-btn').forEach(function(btn) {
            var d = parseInt(btn.getAttribute('data-day'));
            if (days.indexOf(d) !== -1) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function updateStats() {
        var tasks = loadWeekTasks();
        var total = 0, done = 0;

        for (var day = 0; day < 7; day++) {
            var dayTasks = tasks[day] || [];
            total += dayTasks.length;
            for (var i = 0; i < dayTasks.length; i++) {
                if (dayTasks[i].done) done++;
            }
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
            var day = parseInt(tab.getAttribute('data-day'));
            var dayTasks = tasks[day] || [];
            var hasUndoneTasks = dayTasks.some(function(t) { return !t.done; });

            tab.classList.remove('active', 'has-tasks', 'today');
            if (day === currentDay) tab.classList.add('active');
            if (hasUndoneTasks) tab.classList.add('has-tasks');
            if (day === todayIndex) tab.classList.add('today');
        });
    }

    // ========== РЕНДЕР: НЕДЕЛЬНЫЕ ЗАДАЧИ ==========

    function renderWeekTasks() {
        var tasks = applyRepeats();
        var dayTasks = tasks[currentDay] || [];
        var list = document.getElementById('tasks-list');
        var empty = document.getElementById('empty-state');
        var title = document.getElementById('day-title');

        if (title) title.textContent = DAYS[currentDay];

        dayTasks.sort(function(a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            if (b.priority !== a.priority) return b.priority - a.priority;
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        if (dayTasks.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
        } else {
            if (empty) empty.classList.remove('show');
            if (list) list.innerHTML = renderTasksList(dayTasks, 'week');
        }

        updateStats();
        updateTabs();
    }

    // ========== РЕНДЕР: ЗАДАЧИ ПО ДАТЕ ==========

    function renderDateTasks() {
        var tasks = loadDateTasks(selectedDate);
        var list = document.getElementById('calendar-tasks-list');
        var empty = document.getElementById('empty-calendar');
        var title = document.getElementById('calendar-title');

        if (title) title.textContent = formatDateRu(selectedDate);

        tasks.sort(function(a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            if (b.priority !== a.priority) return b.priority - a.priority;
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        if (tasks.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
        } else {
            if (empty) empty.classList.remove('show');
            if (list) list.innerHTML = renderTasksList(tasks, 'calendar');
        }
    }

    // ========== ОБЩИЙ РЕНДЕР ЗАДАЧ ==========

    function renderTasksList(tasks, source) {
        var html = '';
        
        for (var i = 0; i < tasks.length; i++) {
            var t = tasks[i];
            var repeatClass = t.repeatId ? ' from-repeat' : '';
            
            html += '<div class="task-card ' + (t.done ? 'done' : '') + repeatClass + '" ';
            html += 'data-id="' + t.id + '" data-priority="' + (t.priority || 0) + '" data-source="' + source + '">';
            html += '<div class="task-checkbox ' + (t.done ? 'checked' : '') + '" data-id="' + t.id + '"></div>';
            html += '<div class="task-content">';
            html += '<div class="task-meta">';
            
            if (t.time) {
                html += '<span class="task-time">⏰ ' + escapeHtml(t.time) + '</span>';
            }
            
            html += '<span class="task-priority" data-id="' + t.id + '">' + PRIORITY_EMOJI[t.priority || 0] + '</span>';
            
            if (t.repeatId) {
                html += '<span class="task-repeat">🔄</span>';
            }
            
            html += '</div>';
            html += '<div class="task-text">' + escapeHtml(t.text) + '</div>';
            html += '</div>';
            html += '<button class="task-delete" data-id="' + t.id + '">×</button>';
            html += '</div>';
        }
        
        return html;
    }

    // ========== РЕНДЕР: ПОВТОРЫ ==========

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
        for (var i = 0; i < repeats.length; i++) {
            var r = repeats[i];
            var schedule = REPEAT_LABELS[r.type] || r.type;
            var daysToShow = getRepeatDays(r);
            
            var statusClass = r.active ? '' : 'inactive';
            var toggleText = r.active ? '⏸ Пауза' : '▶️ Включить';

            html += '<div class="repeat-card ' + statusClass + '" data-id="' + r.id + '">';
            html += '<div class="repeat-header">';
            html += '<span class="repeat-priority">' + PRIORITY_EMOJI[r.priority || 0] + '</span>';
            html += '<span class="repeat-text">' + escapeHtml(r.text) + '</span>';
            html += '</div>';
            html += '<div class="repeat-info">';
            
            if (r.time) {
                html += '<span class="repeat-badge">⏰ ' + escapeHtml(r.time) + '</span>';
            }
            
            html += '<span class="repeat-badge">📅 ' + escapeHtml(schedule) + '</span>';
            html += '</div>';
            
            // Превью дней
            html += '<div class="repeat-days-preview">';
            for (var d = 0; d < 7; d++) {
                var isActive = daysToShow.indexOf(d) !== -1;
                html += '<div class="repeat-day-dot ' + (isActive ? 'active' : '') + '">' + DAYS_SHORT[d] + '</div>';
            }
            html += '</div>';
            
            html += '<div class="repeat-actions">';
            html += '<button class="btn-toggle" data-id="' + r.id + '">' + toggleText + '</button>';
            html += '<button class="btn-remove" data-id="' + r.id + '">🗑 Удалить</button>';
            html += '</div>';
            html += '</div>';
        }

        if (list) list.innerHTML = html;
    }

    // ========== ДЕЙСТВИЯ: НЕДЕЛЬНЫЕ ЗАДАЧИ ==========
    
    function toggleWeekTask(id) {
        var tasks = loadWeekTasks();
        var dayTasks = tasks[currentDay] || [];

        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id === id) {
                dayTasks[i].done = !dayTasks[i].done;
                showToast(dayTasks[i].done ? '✓ Выполнено!' : 'Возвращено', 'success');
                break;
            }
        }

        saveWeekTasks(tasks);
        haptic('success');
        renderWeekTasks();
    }

    function deleteWeekTask(id) {
        var tasks = loadWeekTasks();
        tasks[currentDay] = (tasks[currentDay] || []).filter(function(t) { return t.id !== id; });
        saveWeekTasks(tasks);
        haptic('success');
        showToast('Задача удалена', 'success');
        renderWeekTasks();
        closeModal('modal-confirm');
    }

    function addWeekTask(text, time, priority) {
        if (!text || !text.trim()) return;
        
        var tasks = loadWeekTasks();
        if (!tasks[currentDay]) tasks[currentDay] = [];

        tasks[currentDay].push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            priority: priority || 0,
            done: false,
            repeatId: null
        });

        saveWeekTasks(tasks);
        haptic('success');
        showToast('Задача добавлена!', 'success');
        renderWeekTasks();
    }

    function changeWeekPriority(id, priority) {
        var tasks = loadWeekTasks();
        var dayTasks = tasks[currentDay] || [];

        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id === id) {
                dayTasks[i].priority = priority;
                break;
            }
        }

        saveWeekTasks(tasks);
        haptic('success');
        renderWeekTasks();
        closeModal('modal-priority');
    }

    function clearWeekDay() {
        var tasks = loadWeekTasks();
        var count = (tasks[currentDay] || []).length;
        
        if (count === 0) {
            showToast('День уже пуст', 'error');
            return;
        }
        
        haptic('warning');
        document.getElementById('confirm-text').textContent = 
            'Удалить все ' + count + ' задач за ' + DAYS[currentDay] + '?';
        
        confirmCallback = function() {
            var tasks = loadWeekTasks();
            tasks[currentDay] = [];
            saveWeekTasks(tasks);
            haptic('success');
            showToast('День очищен', 'success');
            renderWeekTasks();
            closeModal('modal-confirm');
        };
        
        openModal('modal-confirm');
    }

    // ========== ДЕЙСТВИЯ: ЗАДАЧИ ПО ДАТЕ ==========

    function toggleDateTask(id) {
        var tasks = loadDateTasks(selectedDate);

        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === id) {
                tasks[i].done = !tasks[i].done;
                showToast(tasks[i].done ? '✓ Выполнено!' : 'Возвращено', 'success');
                break;
            }
        }

        saveDateTasks(selectedDate, tasks);
        haptic('success');
        renderDateTasks();
    }

    function deleteDateTask(id) {
        var tasks = loadDateTasks(selectedDate);
        tasks = tasks.filter(function(t) { return t.id !== id; });
        saveDateTasks(selectedDate, tasks);
        haptic('success');
        showToast('Задача удалена', 'success');
        renderDateTasks();
        closeModal('modal-confirm');
    }

    function addDateTask(text, time, priority) {
        if (!text || !text.trim()) return;
        
        var tasks = loadDateTasks(selectedDate);

        tasks.push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            priority: priority || 0,
            done: false
        });

        saveDateTasks(selectedDate, tasks);
        haptic('success');
        showToast('Задача добавлена!', 'success');
        renderDateTasks();
    }

    function changeDatePriority(id, priority) {
        var tasks = loadDateTasks(selectedDate);

        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === id) {
                tasks[i].priority = priority;
                break;
            }
        }

        saveDateTasks(selectedDate, tasks);
        haptic('success');
        renderDateTasks();
        closeModal('modal-priority');
    }

    function clearDate() {
        var tasks = loadDateTasks(selectedDate);
        
        if (tasks.length === 0) {
            showToast('Дата уже пуста', 'error');
            return;
        }
        
        haptic('warning');
        document.getElementById('confirm-text').textContent = 
            'Удалить все задачи за ' + formatDateRu(selectedDate) + '?';
        
        confirmCallback = function() {
            saveDateTasks(selectedDate, []);
            haptic('success');
            showToast('Дата очищена', 'success');
            renderDateTasks();
            closeModal('modal-confirm');
        };
        
        openModal('modal-confirm');
    }

    // ========== ДЕЙСТВИЯ: ПОВТОРЫ ==========

    function toggleRepeat(id) {
        var repeats = loadRepeats();

        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].id === id) {
                repeats[i].active = !repeats[i].active;
                showToast(repeats[i].active ? 'Повтор включён' : 'Повтор на паузе', 'success');
                break;
            }
        }

        saveRepeats(repeats);
        haptic('success');
        renderRepeats();
    }

    function deleteRepeat(id) {
        var repeats = loadRepeats();
        var deletedText = '';
        
        repeats = repeats.filter(function(r) {
            if (r.id === id) {
                deletedText = r.text;
                return false;
            }
            return true;
        });
        
        saveRepeats(repeats);
        
        // Удаляем связанные задачи
        var removed = removeRepeatTasks(id);
        
        haptic('success');
        showToast('Повтор удалён' + (removed ? ' и связанные задачи' : ''), 'success');
        renderRepeats();
        renderWeekTasks();
        closeModal('modal-confirm');
    }

    function createRepeat(text, time, priority, type, days) {
        if (!text || !text.trim()) {
            showToast('Введите текст задачи', 'error');
            return false;
        }
        
        if (type === 'weekly' && (!days || days.length === 0)) {
            showToast('Выберите дни недели', 'error');
            haptic('error');
            return false;
        }
        
        var repeats = loadRepeats();
        
        repeats.push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            priority: priority || 0,
            type: type,
            days: (type === 'weekly') ? days.slice() : [],
            active: true
        });

        saveRepeats(repeats);
        haptic('success');
        showToast('Повтор создан!', 'success');
        
        applyRepeats();
        renderRepeats();
        renderWeekTasks();
        
        return true;
    }

    // ========== SWIPE ==========
    
    var touchStartX = 0;
    
    function handleSwipe(endX) {
        var diff = touchStartX - endX;
        if (Math.abs(diff) > 60 && currentView === 'tasks') {
            if (diff > 0 && currentDay < 6) {
                currentDay++;
                haptic('light');
                renderWeekTasks();
            } else if (diff < 0 && currentDay > 0) {
                currentDay--;
                haptic('light');
                renderWeekTasks();
            }
        }
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    
    function init() {
        console.log('=== Инициализация еженедельника v2 ===');
        
        // Установка сегодняшней даты
        var datePicker = document.getElementById('calendar-date');
        if (datePicker) {
            datePicker.value = selectedDate;
        }
        
        renderWeekTasks();
        renderDateTasks();
        renderRepeats();

        // === SWIPE ===
        var tasksContainer = document.querySelector('.tasks-container');
        if (tasksContainer) {
            tasksContainer.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });
            
            tasksContainer.addEventListener('touchend', function(e) {
                handleSwipe(e.changedTouches[0].screenX);
            }, { passive: true });
        }

        // === NAV TABS ===
        document.querySelectorAll('.nav-tab').forEach(function(tab) {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                currentView = this.getAttribute('data-view');

                document.querySelectorAll('.nav-tab').forEach(function(t) {
                    t.classList.remove('active');
                });
                this.classList.add('active');

                document.querySelectorAll('.view').forEach(function(v) {
                    v.classList.remove('active');
                });
                
                var targetView = document.getElementById('view-' + currentView);
                if (targetView) targetView.classList.add('active');

                haptic('light');
                
                if (currentView === 'tasks') renderWeekTasks();
                else if (currentView === 'calendar') renderDateTasks();
                else if (currentView === 'repeats') renderRepeats();
            });
        });

        // === DAY TABS ===
        document.querySelectorAll('.tabs .tab').forEach(function(tab) {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                currentDay = parseInt(this.getAttribute('data-day'));
                haptic('light');
                renderWeekTasks();
            });
        });

        // === DATE PICKER ===
        var datePickerEl = document.getElementById('calendar-date');
        if (datePickerEl) {
            datePickerEl.addEventListener('change', function() {
                selectedDate = this.value;
                renderDateTasks();
            });
        }

        // === FAB BUTTON ===
        var btnAdd = document.getElementById('btn-add');
        if (btnAdd) {
            btnAdd.addEventListener('click', function(e) {
                e.preventDefault();
                haptic('light');
                
                if (currentView === 'tasks') {
                    openModal('modal-add');
                } else if (currentView === 'calendar') {
                    openModal('modal-add-calendar');
                } else if (currentView === 'repeats') {
                    openModal('modal-repeat');
                }
            });
        }

        // === CLEAR BUTTONS ===
        var btnClearDay = document.getElementById('btn-clear-day');
        if (btnClearDay) {
            btnClearDay.addEventListener('click', function(e) {
                e.preventDefault();
                clearWeekDay();
            });
        }

        var btnClearDate = document.getElementById('btn-clear-date');
        if (btnClearDate) {
            btnClearDate.addEventListener('click', function(e) {
                e.preventDefault();
                clearDate();
            });
        }

        // === CLOSE MODALS ===
        document.querySelectorAll('.modal-close, .btn-cancel').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var modalId = this.getAttribute('data-modal');
                if (modalId) closeModal(modalId);
            });
        });

        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) closeModal(this.id);
            });
        });

        // === PRIORITY BUTTONS ===
        ['priority-select', 'calendar-priority-select', 'repeat-priority-select'].forEach(function(containerId) {
            var container = document.getElementById(containerId);
            if (container) {
                container.querySelectorAll('.priority-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var priority = parseInt(this.getAttribute('data-priority'));
                        
                        if (containerId === 'priority-select') {
                            selectedPriority = priority;
                        } else if (containerId === 'calendar-priority-select') {
                            selectedCalendarPriority = priority;
                        } else {
                            selectedRepeatPriority = priority;
                        }
                        
                        updatePriorityButtons(containerId, priority);
                        haptic('light');
                    });
                });
            }
        });

        // === REPEAT TYPE ===
        var repeatTypeSelect = document.getElementById('repeat-type-select');
        if (repeatTypeSelect) {
            repeatTypeSelect.querySelectorAll('.repeat-type-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedRepeatType = this.getAttribute('data-type');
                    updateRepeatTypeButtons(selectedRepeatType);
                    haptic('light');
                });
            });
        }

        // === DAYS SELECT ===
        var daysSelect = document.getElementById('days-select');
        if (daysSelect) {
            daysSelect.querySelectorAll('.day-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var d = parseInt(this.getAttribute('data-day'));
                    var idx = selectedDays.indexOf(d);
                    
                    if (idx !== -1) {
                        selectedDays.splice(idx, 1);
                    } else {
                        selectedDays.push(d);
                    }
                    
                    updateDaysButtons(selectedDays);
                    haptic('light');
                });
            });
        }

        // === FORMS ===
        var formAddTask = document.getElementById('form-add-task');
        if (formAddTask) {
            formAddTask.addEventListener('submit', function(e) {
                e.preventDefault();
                var text = document.getElementById('task-text').value.trim();
                var time = document.getElementById('task-time').value;
                
                if (text) {
                    addWeekTask(text, time, selectedPriority);
                    closeModal('modal-add');
                }
            });
        }

        var formAddCalendarTask = document.getElementById('form-add-calendar-task');
        if (formAddCalendarTask) {
            formAddCalendarTask.addEventListener('submit', function(e) {
                e.preventDefault();
                var text = document.getElementById('calendar-task-text').value.trim();
                var time = document.getElementById('calendar-task-time').value;
                
                if (text) {
                    addDateTask(text, time, selectedCalendarPriority);
                    closeModal('modal-add-calendar');
                }
            });
        }

        var formAddRepeat = document.getElementById('form-add-repeat');
        if (formAddRepeat) {
            formAddRepeat.addEventListener('submit', function(e) {
                e.preventDefault();
                var text = document.getElementById('repeat-text').value.trim();
                var time = document.getElementById('repeat-time').value;

                if (createRepeat(text, time, selectedRepeatPriority, selectedRepeatType, selectedDays.slice())) {
                    closeModal('modal-repeat');
                }
            });
        }

        // === PRIORITY CHANGE MODAL ===
        var prioChange = document.getElementById('priority-change');
        if (prioChange) {
            prioChange.querySelectorAll('.priority-option').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var priority = parseInt(this.getAttribute('data-priority'));
                    
                    if (prioritySource === 'calendar') {
                        changeDatePriority(priorityTaskId, priority);
                    } else {
                        changeWeekPriority(priorityTaskId, priority);
                    }
                    
                    priorityTaskId = null;
                });
            });
        }

        // === CONFIRM BUTTON ===
        var btnConfirm = document.getElementById('btn-confirm-ok');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirmCallback) confirmCallback();
                confirmCallback = null;
            });
        }

        // === TASK LIST DELEGATION (WEEK) ===
        var tasksList = document.getElementById('tasks-list');
        if (tasksList) {
            tasksList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('task-checkbox')) {
                    e.preventDefault();
                    if (id) toggleWeekTask(id);
                    
                } else if (target.classList.contains('task-priority')) {
                    e.preventDefault();
                    if (id) {
                        priorityTaskId = id;
                        prioritySource = 'week';
                        haptic('light');
                        openModal('modal-priority');
                    }
                    
                } else if (target.classList.contains('task-delete')) {
                    e.preventDefault();
                    if (id) {
                        haptic('warning');
                        document.getElementById('confirm-text').textContent = 'Удалить задачу?';
                        confirmCallback = function() { deleteWeekTask(id); };
                        openModal('modal-confirm');
                    }
                }
            });
        }

        // === TASK LIST DELEGATION (CALENDAR) ===
        var calendarTasksList = document.getElementById('calendar-tasks-list');
        if (calendarTasksList) {
            calendarTasksList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('task-checkbox')) {
                    e.preventDefault();
                    if (id) toggleDateTask(id);
                    
                } else if (target.classList.contains('task-priority')) {
                    e.preventDefault();
                    if (id) {
                        priorityTaskId = id;
                        prioritySource = 'calendar';
                        haptic('light');
                        openModal('modal-priority');
                    }
                    
                } else if (target.classList.contains('task-delete')) {
                    e.preventDefault();
                    if (id) {
                        haptic('warning');
                        document.getElementById('confirm-text').textContent = 'Удалить задачу?';
                        confirmCallback = function() { deleteDateTask(id); };
                        openModal('modal-confirm');
                    }
                }
            });
        }

        // === REPEATS LIST DELEGATION ===
        var repeatsList = document.getElementById('repeats-list');
        if (repeatsList) {
            repeatsList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('btn-toggle')) {
                    e.preventDefault();
                    if (id) toggleRepeat(id);
                    
                } else if (target.classList.contains('btn-remove')) {
                    e.preventDefault();
                    if (id) {
                        haptic('warning');
                        document.getElementById('confirm-text').textContent = 
                            'Удалить повтор и все связанные задачи?';
                        confirmCallback = function() { deleteRepeat(id); };
                        openModal('modal-confirm');
                    }
                }
            });
        }

        // === KEYBOARD ===
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal('modal-add');
                closeModal('modal-add-calendar');
                closeModal('modal-repeat');
                closeModal('modal-confirm');
                closeModal('modal-priority');
            }
        });

        console.log('=== Приложение готово! ===');
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
