class DateRangeHelper {
    // 计算月的起始和结束日期
    static getMonthRange(monthOffset = 0, timezoneOffset = 0) {
        // 获取用户时区的当前时间
        const now = new Date();
        const userNow = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000);

        // 获取用户时区的今天0点
        const userToday = new Date(userNow);
        userToday.setHours(0, 0, 0, 0);

        // 计算目标月份
        const targetMonth = new Date(userToday);
        targetMonth.setMonth(userToday.getMonth() + monthOffset);
        targetMonth.setDate(1); // 设置为月初

        // 计算月初
        const monthStart = new Date(targetMonth);

        // 计算月末（下个月的第0天就是本月最后一天）
        const monthEnd = new Date(targetMonth);
        monthEnd.setMonth(targetMonth.getMonth() + 1);
        monthEnd.setDate(0);

        // 如果是本月，结束日期不能超过今天
        let endDate = monthEnd;
        if (monthOffset === 0 && monthEnd > userToday) {
            endDate = new Date(userToday);
        }

        return {
            startDate: monthStart,
            endDate: endDate
        };
    }

    // 计算周的起始和结束日期
    static getWeekRange(weekOffset = 0, timezoneOffset = 0) {
        // 获取用户时区的当前时间
        const now = new Date();
        const userNow = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000);

        // 获取用户时区的今天0点
        const userToday = new Date(userNow);
        userToday.setHours(0, 0, 0, 0);

        // 计算当前是周几 (0=周日, 1=周一, ..., 6=周六)
        const dayOfWeek = userToday.getDay();

        // 计算本周一的日期 (如果今天是周日，则为上周一)
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const thisWeekMonday = new Date(userToday);
        thisWeekMonday.setDate(userToday.getDate() - daysFromMonday);

        // 根据weekOffset计算目标周的周一
        const targetWeekMonday = new Date(thisWeekMonday);
        targetWeekMonday.setDate(thisWeekMonday.getDate() + weekOffset * 7);

        // 计算周日
        const targetWeekSunday = new Date(targetWeekMonday);
        targetWeekSunday.setDate(targetWeekMonday.getDate() + 6);

        // 如果是本周，结束日期不能超过今天
        let endDate = targetWeekSunday;
        if (weekOffset === 0 && targetWeekSunday > userToday) {
            endDate = new Date(userToday);
        }

        return {
            startDate: targetWeekMonday,
            endDate: endDate
        };
    }
}

module.exports = DateRangeHelper;