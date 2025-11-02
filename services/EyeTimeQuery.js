// EyeTimeQuery.js - 仅统计用眼分钟数(日/周/月), 支持时区
const { mongoose } = require('../index');
const DateRangeHelper = require('../utils/DateRange');
const TimezoneUtils = require('../utils/timezone');

const DailyEyeTime = mongoose.model('DailyEyeTime');

class EyeTimeQuery {
    constructor(timezoneOffset = 8) {
        // 初始化时区工具与日期范围助手
        this.timezoneOffset = timezoneOffset;
        this.timezoneUtils = new TimezoneUtils(timezoneOffset);
        this.dateHelper = new DateRangeHelper(timezoneOffset);
    }

    /**
     * 获取某日的用眼分钟数
     * @param {Date} date - 查询目标日期（UTC 或本地时间均可）
     * @param {number} timezoneOffset - 时区偏移（小时）
     */
    async getDailyMinutes(date, timezoneOffset = this.timezoneOffset) {
        const tzUtils = new TimezoneUtils(timezoneOffset);

        // 获取本地当天起止时间（转换为 UTC）
        const localStart = tzUtils.getLocalDayStart(date);
        const nextDayStart = new Date(localStart.getTime() + 24 * 60 * 60 * 1000);

        // 查询记录
        const dayRecords = await DailyEyeTime.find({
            date: { $gte: localStart, $lt: nextDayStart }
        }).lean();

        // 初始化小时分布
        const hourlyStats = Array(24).fill(0);

        for (const rec of dayRecords) {
            if (rec.hourlyUsage && Array.isArray(rec.hourlyUsage)) {
                for (let i = 0; i < 24; i++) {
                    hourlyStats[i] += rec.hourlyUsage[i] || 0;
                }
            }
        }

        // 总分钟数直接用小时分布求和
        const totalUsage = Math.round(hourlyStats.reduce((a, b) => a + b, 0) * 100) / 100;

        const userDate = tzUtils.utcToLocal(localStart);

        return {
            date: userDate.toISOString().split('T')[0],
            totalUsage,
            hourlyStats: hourlyStats.map(v => Math.round(v * 100) / 100),
            timezoneOffset
        };
    }


    /**
     * 获取周统计结果
     */
    async getWeeklyMinutes(weekOffset = 0, timezoneOffset = this.timezoneOffset) {
        const { startDate, endDate } = this.dateHelper.getWeekRange(weekOffset);
        const result = {};

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const stats = await this.getDailyMinutes(new Date(d), timezoneOffset);
            result[stats.date] = stats.totalUsage;
        }

        return {
            weekOffset,
            weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: result,
            timezoneOffset
        };
    }

    /**
     * 获取月统计结果
     */
    async getMonthlyMinutes(monthOffset = 0, timezoneOffset = this.timezoneOffset) {
        const { startDate, endDate } = this.dateHelper.getMonthRange(monthOffset, timezoneOffset);
        const result = {};

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const stats = await this.getDailyMinutes(new Date(d), timezoneOffset);
            result[stats.date] = stats.totalUsage;
        }

        return {
            monthOffset,
            monthRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            dailyTotals: result,
            timezoneOffset
        };
    }
}

module.exports = EyeTimeQuery;
