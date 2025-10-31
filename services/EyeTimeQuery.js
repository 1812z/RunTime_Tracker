// EyeTimeQuery.js - 仅统计用眼分钟数(日/周/月),支持时区
const { mongoose } = require('../index');
const DateRangeHelper = require('./DateRange');

const DailyEyeTime = mongoose.model('DailyEyeTime');

class EyeTimeQuery {
    constructor() {}

    // 获取日查询结果
    async getDailyMinutes(date, timezoneOffset = 0) {
        // 用户时区的目标日期 (00:00:00)
        const userDate = new Date(date);
        userDate.setHours(0, 0, 0, 0);

        // 用户时区一天的时间范围
        const userDayStart = userDate.getTime();
        const userDayEnd = userDayStart + 24 * 60 * 60 * 1000;

        // 转换为 UTC 时间范围
        const utcStartTime = new Date(userDayStart - timezoneOffset * 60 * 60 * 1000);
        const utcEndTime = new Date(userDayEnd - timezoneOffset * 60 * 60 * 1000);

        // 计算需要查询的 UTC 日期
        const utcStartDate = new Date(utcStartTime);
        utcStartDate.setHours(0, 0, 0, 0);

        const utcEndDate = new Date(utcEndTime);
        utcEndDate.setHours(0, 0, 0, 0);

        // 可能需要查询 1-2 天的 UTC 数据
        const utcDates = [utcStartDate];
        if (utcEndDate.getTime() !== utcStartDate.getTime()) {
            utcDates.push(utcEndDate);
        }

        let totalUsage = 0;
        let hourlyStats = Array(24).fill(0);

        // 查询所有相关的 UTC 日期
        for (const utcDate of utcDates) {
            const doc = await DailyEyeTime.findOne({ date: utcDate });

            if (doc && doc.hourlyUsage) {
                doc.hourlyUsage.forEach((minutes, utcHour) => {
                    // 构建 UTC 时间戳
                    const utcTimestamp = new Date(utcDate);
                    utcTimestamp.setHours(utcHour, 0, 0, 0);

                    // 转换到用户时区
                    const userTimestamp = utcTimestamp.getTime() + timezoneOffset * 60 * 60 * 1000;

                    // 检查是否在目标用户日期内
                    if (userTimestamp >= userDayStart && userTimestamp < userDayEnd) {
                        const userDate = new Date(userTimestamp);
                        const userHour = userDate.getHours();
                        hourlyStats[userHour] += minutes;
                        totalUsage += minutes;
                    }
                });
            }
        }

        return {
            date: userDate.toISOString().split('T')[0],
            totalUsage,
            hourlyStats,
            timezoneOffset,
        };
    }

    // 获取周查询结果
    async getWeeklyMinutes(weekOffset = 0, timezoneOffset = 0) {
        // 使用公共工具类
        const { startDate, endDate } = DateRangeHelper.getWeekRange(weekOffset, timezoneOffset);

        const result = {};

        // 遍历周内的每一天
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const stats = await this.getDailyMinutes(new Date(d), timezoneOffset);
            result[stats.date] = stats.totalUsage;
        }

        return {
            weekOffset,
            weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
            },
            dailyTotals: result,
            timezoneOffset,
        };
    }

    // 获取月查询结果
    async getMonthlyMinutes(monthOffset = 0, timezoneOffset = 0) {
        // 使用公共工具类
        const { startDate, endDate } = DateRangeHelper.getMonthRange(monthOffset, timezoneOffset);

        const result = {};

        // 遍历月内的每一天
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const stats = await this.getDailyMinutes(new Date(d), timezoneOffset);
            result[stats.date] = stats.totalUsage;
        }

        return {
            monthOffset,
            monthRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
            },
            dailyTotals: result,
            timezoneOffset,
        };
    }
}

module.exports = EyeTimeQuery;