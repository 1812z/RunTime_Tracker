// utils/timezone.js - 完整版, 支持偏移量与 IANA 时区名称
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

class TimezoneUtils {
    constructor(timezoneNameOrOffset) {
        // 默认使用上海时区 (UTC+8)
        if (timezoneNameOrOffset === null || timezoneNameOrOffset === undefined) {
            timezoneNameOrOffset = 'Asia/Shanghai';
        }

        if (typeof timezoneNameOrOffset === 'number') {
            // 数字模式 => 偏移量（小时）
            this.offsetHours = timezoneNameOrOffset;
            this.offsetMs = timezoneNameOrOffset * 60 * 60 * 1000;
            this.useOffset = true;
            this.timezoneName = null;
        } else {
            // 字符串模式 => IANA 时区
            this.timezoneName = timezoneNameOrOffset;
            this.useOffset = false;
            this.offsetMs = 0;
            this.offsetHours = 0;
        }
    }

    /** ✅ UTC -> 本地时区时间 */
    utcToLocal(utcDate) {
        if (!(utcDate instanceof Date)) {
            utcDate = new Date(utcDate);
        }
        if (this.useOffset) {
            return new Date(utcDate.getTime() + this.offsetMs);
        } else {
            return dayjs.utc(utcDate).tz(this.timezoneName).toDate();
        }
    }

    /** ✅ 本地时区时间 -> UTC */
    localToUtc(localDate) {
        if (!(localDate instanceof Date)) {
            localDate = new Date(localDate);
        }
        if (this.useOffset) {
            return new Date(localDate.getTime() - this.offsetMs);
        } else {
            return dayjs.tz(localDate, this.timezoneName).utc().toDate();
        }
    }

    /**
     * ✅ 获取某个 UTC 时间对应的“本地日期零点的 UTC 时间”
     * 例如北京时间 2025-11-02T10:00Z -> 返回该天本地零点对应的 UTC 时间 2025-11-01T16:00Z
     */
    getLocalDayStart(timestamp) {
        const utcDate = new Date(timestamp);
        const localTime = this.utcToLocal(utcDate);

        const year = localTime.getFullYear();
        const month = localTime.getMonth();
        const day = localTime.getDate();

        // 构造该时区日期的本地零点
        const localMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

        // 转换回 UTC
        return this.localToUtc(localMidnight);
    }

    /**
     * ✅ 获取目标时区当前日期的“零点 UTC 时间”
     */
    getTodayStartUtc() {
        const now = new Date();
        return this.getLocalDayStart(now);
    }

    /**
     * ✅ 获取目标时区的当前本地日期对象（不带时间）
     */
    getTodayInLocal() {
        const now = new Date();
        const localNow = this.utcToLocal(now);
        return new Date(Date.UTC(
            localNow.getUTCFullYear(),
            localNow.getUTCMonth(),
            localNow.getUTCDate()
        ));
    }

    /**
     * ✅ 提取日期部分（丢弃时间）
     */
    getLocalDateOnly(timestamp) {
        const localTime = this.utcToLocal(new Date(timestamp));
        return new Date(Date.UTC(
            localTime.getUTCFullYear(),
            localTime.getUTCMonth(),
            localTime.getUTCDate()
        ));
    }

    /**
     * ✅ 解析输入日期（字符串 / Date / 时间戳）
     */
    parseDate(dateInput) {
        if (dateInput === null || dateInput === undefined) {
            throw new Error('Date input cannot be null or undefined');
        }

        let date;
        if (dateInput instanceof Date) {
            date = dateInput;
        } else if (typeof dateInput === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                const [year, month, day] = dateInput.split('-').map(Number);
                date = new Date(Date.UTC(year, month - 1, day));
            } else {
                date = new Date(dateInput);
                if (isNaN(date.getTime())) {
                    throw new Error(`Invalid date string: ${dateInput}`);
                }
            }
        } else if (typeof dateInput === 'number') {
            date = new Date(dateInput);
        } else {
            throw new Error(`Invalid date input type: ${typeof dateInput}`);
        }

        return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        ));
    }
}

module.exports = TimezoneUtils;
