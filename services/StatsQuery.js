// StatsQuery.js - 简化版（适配新的存储逻辑）
const { mongoose } = require('../index');
const DateRangeHelper = require('../utils/DateRange');
const TimezoneUtils = require('../utils/timezone');

const DailyStat = mongoose.model('DailyStat');

class StatsQuery {
    constructor(recorder, config = {}) {
        this.recorder = recorder;
        this.timezoneOffset = config.timezoneOffset || 8;
        this.dateRangeHelper = new DateRangeHelper(this.timezoneOffset);
        this.tzUtils = new TimezoneUtils(this.timezoneOffset);
    }

    // 查询统计数据（直接查询本地日期）
    async _queryStats(query, startDate, endDate) {
        // 构建查询日期数组（本地时区日期）
        const queryDates = [];
        const current = new Date(startDate);

        while (current <= endDate) {
            // 转换为数据库存储格式（本地零点对应的 UTC 时间）
            const localDayStart = new Date(Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth(),
                current.getUTCDate(),
                0, 0, 0, 0
            ));
            const dbDate = this.tzUtils.localToUtc(localDayStart);
            queryDates.push(dbDate);

            // 移动到下一天
            current.setUTCDate(current.getUTCDate() + 1);
        }

        query.date = { $in: queryDates };
        return DailyStat.find(query);
    }

    // 处理统计数据
    _processStats(allStats, startDate, endDate, isSingleDay = false) {
        const dailyStats = {};
        const appDailyStats = {};
        const hourlyStats = Array(24).fill(0);
        const appHourlyStats = {};
        let totalUsage = 0;

        allStats.forEach(stat => {
            const appName = stat.appName;

            // 将数据库的 date 转换回本地日期
            const dbDate = new Date(stat.date);
            const localDayStart = this.tzUtils.utcToLocal(dbDate);
            const localDateOnly = new Date(Date.UTC(
                localDayStart.getUTCFullYear(),
                localDayStart.getUTCMonth(),
                localDayStart.getUTCDate()
            ));

            const dateKey = localDateOnly.toISOString().split('T')[0];

            // 初始化
            if (!dailyStats[dateKey]) dailyStats[dateKey] = 0;
            if (!appDailyStats[appName]) appDailyStats[appName] = {};
            if (!appDailyStats[appName][dateKey]) appDailyStats[appName][dateKey] = 0;
            if (!appHourlyStats[appName]) {
                appHourlyStats[appName] = Array(24).fill(0);
            }

            // 累加每小时数据
            stat.hourlyUsage.forEach((minutes, hour) => {
                if (minutes > 0) {
                    dailyStats[dateKey] += minutes;
                    appDailyStats[appName][dateKey] += minutes;
                    hourlyStats[hour] += minutes;
                    appHourlyStats[appName][hour] += minutes;
                    totalUsage += minutes;
                }
            });
        });

        return { dailyStats, appDailyStats, hourlyStats, appHourlyStats, totalUsage };
    }

    // ============ 对外接口 ============

    // 获取某天的统计数据
    async getDailyStats(deviceId, date) {
        const localDate = this.tzUtils.parseDate(date);

        const allStats = await this._queryStats(
            { deviceId },
            localDate,
            localDate
        );

        const { hourlyStats, appHourlyStats, totalUsage } = this._processStats(
            allStats,
            localDate,
            localDate,
            true
        );

        // 只保留有数据的应用
        const appStats = {};
        Object.keys(appHourlyStats).forEach(appName => {
            const total = appHourlyStats[appName].reduce((sum, val) => sum + val, 0);
            if (total > 0) appStats[appName] = total;
        });

        return {
            totalUsage,
            appStats,
            hourlyStats,
            appHourlyStats: Object.keys(appStats).length > 0 ? appHourlyStats : {}
        };
    }

    // 获取周统计
    async getWeeklyAppStats(deviceId, appName = null, weekOffset = 0) {
        const { startDate, endDate } = this.dateRangeHelper.getWeekRange(weekOffset);

        const query = { deviceId };
        if (appName) query.appName = appName;

        const allStats = await this._queryStats(query, startDate, endDate);
        const { dailyStats, appDailyStats } = this._processStats(allStats, startDate, endDate);

        return {
            weekOffset,
            weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: dailyStats,
            appDailyStats: appName ? { [appName]: appDailyStats[appName] || {} } : appDailyStats
        };
    }

    // 获取月统计
    async getMonthlyAppStats(deviceId, appName = null, monthOffset = 0) {
        const { startDate, endDate } = this.dateRangeHelper.getMonthRange(monthOffset);

        const query = { deviceId };
        if (appName) query.appName = appName;

        const allStats = await this._queryStats(query, startDate, endDate);
        const { dailyStats, appDailyStats } = this._processStats(allStats, startDate, endDate);

        return {
            monthOffset,
            monthRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: dailyStats,
            appDailyStats: appName ? { [appName]: appDailyStats[appName] || {} } : appDailyStats
        };
    }

    // 获取某天所有设备统计
    async getDailyStatsForAllDevices(date) {
        const localDate = this.tzUtils.parseDate(date);

        const allStats = await this._queryStats({}, localDate, localDate);
        const { hourlyStats, appHourlyStats, totalUsage } = this._processStats(
            allStats,
            localDate,
            localDate,
            true
        );

        const appStats = {};
        Object.keys(appHourlyStats).forEach(appName => {
            const total = appHourlyStats[appName].reduce((sum, val) => sum + val, 0);
            if (total > 0) appStats[appName] = total;
        });

        return { totalUsage, appStats, hourlyStats, appHourlyStats };
    }

    // 获取周统计所有设备
    async getWeeklyAppStatsForAllDevices(appName = null, weekOffset = 0) {
        const { startDate, endDate } = this.dateRangeHelper.getWeekRange(weekOffset);

        const query = {};
        if (appName) query.appName = appName;

        const allStats = await this._queryStats(query, startDate, endDate);
        const { dailyStats, appDailyStats } = this._processStats(allStats, startDate, endDate);

        return {
            weekOffset,
            weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: dailyStats,
            appDailyStats: appName ? { [appName]: appDailyStats[appName] || {} } : appDailyStats
        };
    }

    // 获取月统计所有设备
    async getMonthlyAppStatsForAllDevices(appName = null, monthOffset = 0) {
        const { startDate, endDate } = this.dateRangeHelper.getMonthRange(monthOffset);

        const query = {};
        if (appName) query.appName = appName;

        const allStats = await this._queryStats(query, startDate, endDate);
        const { dailyStats, appDailyStats } = this._processStats(allStats, startDate, endDate);

        return {
            monthOffset,
            monthRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: dailyStats,
            appDailyStats: appName ? { [appName]: appDailyStats[appName] || {} } : appDailyStats
        };
    }

    // 获取设备列表
    async getDevices() {
        return Array.from(this.recorder.recentAppSwitches.keys()).map(deviceId => {
            let currentApp = "Unknown";
            let runningSince = new Date();
            let isRunning = true;
            const batteryInfo = this.recorder.getLatestBatteryInfo(deviceId);

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
}

module.exports = StatsQuery;