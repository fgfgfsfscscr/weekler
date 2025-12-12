(function() {
    'use strict';

    // ========== КОНФИГУРАЦИЯ ==========
    // Замените на:
    var API_URL = 'http://de3.rubyhost.ru:28428';
    var USE_API = true;
    
    var tg = window.Telegram && window.Telegram.WebApp;
    
    if (tg) {
        tg.ready();
        tg.expand();
        // USE_API = true;  // Раскомментируйте когда API готов
    }

    var DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    var DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PRIORITY_EMOJI = {0: '⚪', 1: '🟢', 2: '🟡', 3: '🔴'};
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'Еженедельно' };

    var todayIndex = (function() {
        var d = new Date().getDay();
        return d === 0 ? 6 : d - 1;
    })();
    
    var currentDay = todayIndex;
    var currentView = 'tasks';
    var selectedPriority = 0;
    var selectedRepeatPriority = 0;
    var selectedRepeatType = 'daily';
    var selectedDays = [];
    var confirmCallback = null;
    var priorityTaskId = null;
    
    var tasksCache = {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};

    // ========== STORAGE ==========
    
    function getStorageKey() {
        var now = new Date();
        var year = now.getFullYear();
        var week = getWeekNumber(now);
        return 'weekly_' + year + '_' + week;
    }

    function getWeekNumber(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function loadTasks() {
        var data = localStorage.getItem(getStorageKey());
        return data ? JSON.parse(data) : {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
    }

    function saveTasks(tasks) {
        localStorage.setItem(getStorageKey(), JSON.stringify(tasks));
    }

    function loadRepeats() {
        var data = localStorage.getItem('weekly_repeats');
        return data ? JSON.parse(data) : [];
    }

    function saveRepeats(repeats) {
        localStorage.setItem('weekly_repeats', JSON.stringify(repeats));
    }

    function generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    // ========== REPEATS ==========
    
    function applyRepeats() {
        var tasks = loadTasks();
        var repeats = loadRepeats();
        var changed = false;

        for (var i = 0; i < repeats.length; i++) {
            var r = repeats[i];
            if (!r.active) continue;

            var daysToAdd = [];
            if (r.type === 'daily') daysToAdd = [0,1,2,3,4,5,6];
            else if (r.type === 'weekdays') daysToAdd = [0,1,2,3,4];
            else if (r.type === 'weekends') daysToAdd = [5,6];
            else if (r.type === 'weekly') daysToAdd = r.days || [];

            for (var j = 0; j < daysToAdd.length; j++) {
                var day = daysToAdd[j];
                var exists = false;

                for (var k = 0; k < (tasks[day] || []).length; k++) {
                    if (tasks[day][k].repeatId ===
