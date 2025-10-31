// StatsQuery.js - 查询模块 (重构版)
const { mongoose } = require('../index');
const DateRangeHelper = require('./DateRange');

// 引用数据模型
const DailyStat = mongoose.model('DailyStat');

class StatsQuery {
    constructor(recorder) {
        // 引用StatsRecorder实例以访问内存数据
        this.recorder = recorder;
    }

    // 获取月内某个应用的每日使用时间
    async getMonthlyAppStats(deviceId, appName = null, monthOffset = 0, timezoneOffset = 0) {
        // 使用公共工具类获取月的日期范围
        const { startDate, endDate } = DateRangeHelper.getMonthRange(monthOffset, timezoneOffset);

        // 计算需要查询的UTC日期范围
        const utcStartTime = new Date(startDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(endDate.getTime() - timezoneOffset * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);

        const utcStartDate = new Date(utcStartTime);
        utcStartDate.setHours(0, 0, 0, 0);

        const utcEndDate = new Date(utcEndTime);
        utcEndDate.setHours(0, 0, 0, 0);

        // 构建查询条件
        const queryDates = [];
        for (let d = new Date(utcStartDate); d <= utcEndDate; d.setDate(d.getDate() + 1)) {
            queryDates.push(new Date(d));
        }

        // 查询条件
        const query = {
            deviceId,
            date: { $in: queryDates }
        };

        // 如果指定了应用名称，添加过滤
        if (appName) {
            query.appName = appName;
        }

        // 查询数据
        const allStats = await DailyStat.find(query);

        // 初始化结果结构
        const dailyStats = {};
        const appDailyStats = {};

        // 处理每条统计记录
        allStats.forEach(stat => {
            const statAppName = stat.appName;
            const statDate = new Date(stat.date);

            // 处理每小时的数据
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;

                // 构建UTC时间戳
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);

                // 转换为用户时区时间戳
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);

                // 获取用户时区的日期
                const userDateOnly = new Date(userTimestamp);
                userDateOnly.setHours(0, 0, 0, 0);

                // 检查是否在目标月范围内
                if (userDateOnly >= startDate && userDateOnly <= endDate) {
                    const dateKey = userDateOnly.toISOString().split('T')[0];

                    // 初始化日期统计
                    if (!dailyStats[dateKey]) {
                        dailyStats[dateKey] = 0;
                    }

                    // 初始化应用每日统计
                    if (!appDailyStats[statAppName]) {
                        appDailyStats[statAppName] = {};
                    }
                    if (!appDailyStats[statAppName][dateKey]) {
                        appDailyStats[statAppName][dateKey] = 0;
                    }

                    // 累加时间
                    dailyStats[dateKey] += minutes;
                    appDailyStats[statAppName][dateKey] += minutes;
                }
            });
        });

        // 构建返回结果
        const result = {
            monthOffset,
            monthRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            timezoneOffset,
            dailyTotals: dailyStats,
            appDailyStats: appDailyStats
        };

        // 如果指定了应用，只返回该应用的数据
        if (appName) {
            result.appDailyStats = {
                [appName]: appDailyStats[appName] || {}
            };
        }

        return result;
    }

    // 获取7天内某个应用的每日使用时间
    async getWeeklyAppStats(deviceId, appName = null, weekOffset = 0, timezoneOffset = 0) {
        // 使用公共工具类获取周的日期范围
        const { startDate, endDate } = DateRangeHelper.getWeekRange(weekOffset, timezoneOffset);

        // 计算需要查询的UTC日期范围
        const utcStartTime = new Date(startDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(endDate.getTime() - timezoneOffset * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);

        const utcStartDate = new Date(utcStartTime);
        utcStartDate.setHours(0, 0, 0, 0);

        const utcEndDate = new Date(utcEndTime);
        utcEndDate.setHours(0, 0, 0, 0);

        // 构建查询条件
        const queryDates = [];
        for (let d = new Date(utcStartDate); d <= utcEndDate; d.setDate(d.getDate() + 1)) {
            queryDates.push(new Date(d));
        }

        // 查询条件
        const query = {
            deviceId,
            date: { $in: queryDates }
        };

        // 如果指定了应用名称，添加过滤
        if (appName) {
            query.appName = appName;
        }

        // 查询数据
        const allStats = await DailyStat.find(query);

        // 初始化结果结构
        const dailyStats = {};
        const appDailyStats = {};

        // 处理每条统计记录
        allStats.forEach(stat => {
            const statAppName = stat.appName;
            const statDate = new Date(stat.date);

            // 处理每小时的数据
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;

                // 构建UTC时间戳
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);

                // 转换为用户时区时间戳
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);

                // 获取用户时区的日期
                const userDateOnly = new Date(userTimestamp);
                userDateOnly.setHours(0, 0, 0, 0);

                // 检查是否在目标周范围内
                if (userDateOnly >= startDate && userDateOnly <= endDate) {
                    const dateKey = userDateOnly.toISOString().split('T')[0];

                    // 初始化日期统计
                    if (!dailyStats[dateKey]) {
                        dailyStats[dateKey] = 0;
                    }

                    // 初始化应用每日统计
                    if (!appDailyStats[statAppName]) {
                        appDailyStats[statAppName] = {};
                    }
                    if (!appDailyStats[statAppName][dateKey]) {
                        appDailyStats[statAppName][dateKey] = 0;
                    }

                    // 累加时间
                    dailyStats[dateKey] += minutes;
                    appDailyStats[statAppName][dateKey] += minutes;
                }
            });
        });

        // 构建返回结果
        const result = {
            weekOffset,
            weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            timezoneOffset,
            dailyTotals: dailyStats,
            appDailyStats: appDailyStats
        };

        // 如果指定了应用，只返回该应用的数据
        if (appName) {
            result.appDailyStats = {
                [appName]: appDailyStats[appName] || {}
            };
        }

        return result;
    }

    // 获取某天所有设备统计数据总和
    async getDailyStatsForAllDevices(date, timezoneOffset = 0) {
        const userDate = new Date(date);
        userDate.setHours(0, 0, 0, 0);

        const utcStartTime = new Date(userDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(utcStartTime.getTime() + 24 * 60 * 60 * 1000);

        const utcStartDate = new Date(utcStartTime); utcStartDate.setHours(0, 0, 0, 0);
        const utcEndDate = new Date(utcEndTime); utcEndDate.setHours(0, 0, 0, 0);

        const queryDates = [utcStartDate];
        if (utcEndDate.getTime() !== utcStartDate.getTime()) {
            queryDates.push(utcEndDate);
        }

        // 不限定 deviceId
        const allStats = await DailyStat.find({
            date: { $in: queryDates }
        });

        // 跟 getDailyStats 逻辑一致，只是不限定 deviceId，聚合即可
        const result = {
            totalUsage: 0,
            appStats: {},
            hourlyStats: Array(24).fill(0),
            appHourlyStats: {},
            timezoneOffset: timezoneOffset
        };
        allStats.forEach(stat => {
            const appName = stat.appName;
            const statDate = new Date(stat.date);
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);
                const userDateOnly = new Date(userTimestamp); userDateOnly.setHours(0, 0, 0, 0);
                if (userDateOnly.getTime() === userDate.getTime()) {
                    const userHour = userTimestamp.getHours();
                    if (!result.appStats[appName]) {
                        result.appStats[appName] = 0;
                        result.appHourlyStats[appName] = Array(24).fill(0);
                    }
                    result.hourlyStats[userHour] += minutes;
                    result.appHourlyStats[appName][userHour] += minutes;
                    result.appStats[appName] += minutes;
                    result.totalUsage += minutes;
                }
            });
        });
        return result;
    }

    // 获取周统计所有设备
    async getWeeklyAppStatsForAllDevices(appName = null, weekOffset = 0, timezoneOffset = 0) {
        const { startDate, endDate } = DateRangeHelper.getWeekRange(weekOffset, timezoneOffset);
        const utcStartTime = new Date(startDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(endDate.getTime() - timezoneOffset * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);

        const utcStartDate = new Date(utcStartTime); utcStartDate.setHours(0, 0, 0, 0);
        const utcEndDate = new Date(utcEndTime); utcEndDate.setHours(0, 0, 0, 0);

        const queryDates = [];
        for (let d = new Date(utcStartDate); d <= utcEndDate; d.setDate(d.getDate() + 1)) {
            queryDates.push(new Date(d));
        }
        const query = { date: { $in: queryDates } };
        if (appName) query.appName = appName;

        const allStats = await DailyStat.find(query);

        const dailyStats = {};
        const appDailyStats = {};
        allStats.forEach(stat => {
            const statAppName = stat.appName;
            const statDate = new Date(stat.date);
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);
                const userDateOnly = new Date(userTimestamp); userDateOnly.setHours(0, 0, 0, 0);
                if (userDateOnly >= startDate && userDateOnly <= endDate) {
                    const dateKey = userDateOnly.toISOString().split('T')[0];
                    if (!dailyStats[dateKey]) dailyStats[dateKey] = 0;
                    if (!appDailyStats[statAppName]) appDailyStats[statAppName] = {};
                    if (!appDailyStats[statAppName][dateKey]) appDailyStats[statAppName][dateKey] = 0;
                    dailyStats[dateKey] += minutes;
                    appDailyStats[statAppName][dateKey] += minutes;
                }
            });
        });
        const result = {
            weekOffset,
            weekRange: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
            timezoneOffset,
            dailyTotals: dailyStats,
            appDailyStats: appDailyStats
        };
        if (appName) result.appDailyStats = { [appName]: appDailyStats[appName] || {} };
        return result;
    }

    // 获取月统计所有设备
    async getMonthlyAppStatsForAllDevices(appName = null, monthOffset = 0, timezoneOffset = 0) {
        const { startDate, endDate } = DateRangeHelper.getMonthRange(monthOffset, timezoneOffset);
        const utcStartTime = new Date(startDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(endDate.getTime() - timezoneOffset * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);

        const utcStartDate = new Date(utcStartTime); utcStartDate.setHours(0, 0, 0, 0);
        const utcEndDate = new Date(utcEndTime); utcEndDate.setHours(0, 0, 0, 0);

        const queryDates = [];
        for (let d = new Date(utcStartDate); d <= utcEndDate; d.setDate(d.getDate() + 1)) {
            queryDates.push(new Date(d));
        }
        const query = { date: { $in: queryDates } };
        if (appName) query.appName = appName;

        const allStats = await DailyStat.find(query);

        const dailyStats = {};
        const appDailyStats = {};
        allStats.forEach(stat => {
            const statAppName = stat.appName;
            const statDate = new Date(stat.date);
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);
                const userDateOnly = new Date(userTimestamp); userDateOnly.setHours(0, 0, 0, 0);
                if (userDateOnly >= startDate && userDateOnly <= endDate) {
                    const dateKey = userDateOnly.toISOString().split('T')[0];
                    if (!dailyStats[dateKey]) dailyStats[dateKey] = 0;
                    if (!appDailyStats[statAppName]) appDailyStats[statAppName] = {};
                    if (!appDailyStats[statAppName][dateKey]) appDailyStats[statAppName][dateKey] = 0;
                    dailyStats[dateKey] += minutes;
                    appDailyStats[statAppName][dateKey] += minutes;
                }
            });
        });
        const result = {
            monthOffset,
            monthRange: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
            timezoneOffset,
            dailyTotals: dailyStats,
            appDailyStats: appDailyStats
        };
        if (appName) result.appDailyStats = { [appName]: appDailyStats[appName] || {} };
        return result;
    }

    // 获取设备列表
    async getDevices() {
        return Array.from(this.recorder.recentAppSwitches.keys()).map(deviceId => {
            let currentApp = "Unknown";
            let runningSince = new Date();
            let isRunning = true;
            const batteryInfo = this.recorder.getLatestBatteryInfo(deviceId);

            // 获取应用状态
            if (this.recorder.recentAppSwitches.has(deviceId) && this.recorder.recentAppSwitches.get(deviceId).length > 0) {
                const lastSwitch = this.recorder.recentAppSwitches.get(deviceId)[0];
                currentApp = lastSwitch.appName;
                runningSince = lastSwitch.timestamp;
                isRunning = lastSwitch.running !== false;
            }

            return {
                device: deviceId,
                currentApp,
                running: isRunning,
                runningSince,
                batteryLevel: batteryInfo.level,
                isCharging: batteryInfo.isCharging,
                batteryTimestamp: batteryInfo.timestamp
            };
        });
    }

    // 获取某天的统计数据
    async getDailyStats(deviceId, date, timezoneOffset = 0) {
        // 用户时区的目标日期
        const userDate = new Date(date);
        userDate.setHours(0, 0, 0, 0);

        // 转换为UTC时间范围
        const utcStartTime = new Date(userDate.getTime() - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(utcStartTime.getTime() + 24 * 60 * 60 * 1000);

        // 计算需要查询的UTC日期范围
        const utcStartDate = new Date(utcStartTime);
        utcStartDate.setHours(0, 0, 0, 0);

        const utcEndDate = new Date(utcEndTime);
        utcEndDate.setHours(0, 0, 0, 0);

        // 构建查询条件 - 可能跨越1-2个UTC日期
        const queryDates = [utcStartDate];
        if (utcEndDate.getTime() !== utcStartDate.getTime()) {
            queryDates.push(utcEndDate);
        }

        // 单次查询获取所有相关数据
        const allStats = await DailyStat.find({
            deviceId,
            date: { $in: queryDates }
        });

        // 初始化结果结构
        const result = {
            totalUsage: 0,
            appStats: {},
            hourlyStats: Array(24).fill(0),
            appHourlyStats: {},
            timezoneOffset: timezoneOffset
        };

        // 处理每条统计记录
        allStats.forEach(stat => {
            const appName = stat.appName;
            const statDate = new Date(stat.date);

            // 处理每小时的数据
            stat.hourlyUsage.forEach((minutes, utcHour) => {
                if (minutes === 0) return;

                // 构建UTC时间戳
                const utcTimestamp = new Date(statDate);
                utcTimestamp.setHours(utcHour, 0, 0, 0);

                // 转换为用户时区时间戳
                const userTimestamp = new Date(utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000);

                // 检查是否在用户时区的目标日期范围内
                const userDateOnly = new Date(userTimestamp);
                userDateOnly.setHours(0, 0, 0, 0);

                if (userDateOnly.getTime() === userDate.getTime()) {
                    const userHour = userTimestamp.getHours();

                    // 只在数据符合目标日期时才初始化应用统计（避免显示0小时的应用）
                    if (!result.appStats[appName]) {
                        result.appStats[appName] = 0;
                        result.appHourlyStats[appName] = Array(24).fill(0);
                    }

                    result.hourlyStats[userHour] += minutes;
                    result.appHourlyStats[appName][userHour] += minutes;
                    result.appStats[appName] += minutes;
                    result.totalUsage += minutes;
                }
            });
        });

        return result;
    }
}

module.exports = StatsQuery;