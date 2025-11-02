// utils/DateRange.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

class DateRangeHelper {
    constructor(timezoneNameOrOffset = 'Asia/Shanghai') {
        // 判断传入的是时区名称还是偏移量
        if (typeof timezoneNameOrOffset === 'number') {
            this.offsetHours = timezoneNameOrOffset;
            this.offsetMs = timezoneNameOrOffset * 60 * 60 * 1000;
            this.useOffset = true;
            this.timezoneName = null;
        } else {
            this.timezoneName = timezoneNameOrOffset;
            this.useOffset = false;
            this.offsetMs = 0;
        }
    }

    // 获取目标时区的当前日期
    _getTodayInLocal() {
        if (this.useOffset) {
            // 使用偏移量计算
            const now = new Date();
            const localNow = new Date(now.getTime() + this.offsetMs);
            const localDate = new Date(Date.UTC(
                localNow.getUTCFullYear(),
                localNow.getUTCMonth(),
                localNow.getUTCDate()
            ));
            return dayjs.utc(localDate);
        } else {
            // 使用时区名称
            return dayjs().tz(this.timezoneName).startOf('day');
        }
    }

    // 计算月的起始和结束日期
    getMonthRange(monthOffset = 0) {
        const today = this._getTodayInLocal();

        const monthStart = today.add(monthOffset, 'month').startOf('month');
        let monthEnd = monthStart.endOf('month').startOf('day');

        if (monthOffset === 0 && monthEnd.isAfter(today)) {
            monthEnd = today;
        }

        return {
            startDate: monthStart.toDate(),
            endDate: monthEnd.toDate()
        };
    }

    // 计算周的起始和结束日期
    getWeekRange(weekOffset = 0) {
        const today = this._getTodayInLocal();

        // 获取今天是星期几（周一=1，周日=0）
        const dayOfWeek = today.day();

        // 计算本周一（注意周日要单独处理）
        const thisMonday = today.subtract(dayOfWeek === 0 ? 6 : dayOfWeek - 1, 'day').startOf('day');

        // 目标周的周一
        const targetMonday = thisMonday.add(weekOffset, 'week');

        // 目标周的周日
        let targetSunday = targetMonday.add(6, 'day').endOf('day');

        // 如果是本周，结束日期不能超过今天
        if (weekOffset === 0 && targetSunday.isAfter(today)) {
            targetSunday = today.endOf('day');
        }

        return {
            startDate: targetMonday.toDate(),
            endDate: targetSunday.toDate()
        };
    }

}

module.exports = DateRangeHelper;