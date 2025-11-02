// migrate_timezone_v3.js - 正确的时区迁移（移动hourlyUsage数据）
const { mongoose } = require('../index');
const readline = require('readline');

const TIMEZONE_OFFSET = 8;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        rl.question(query, resolve);
    });
}

// 将 UTC 时间转换为 +8 时区的零点
function convertUtcToLocalDayStart(utcDate) {
    const date = new Date(utcDate);
    const localTime = new Date(date.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
    const year = localTime.getUTCFullYear();
    const month = localTime.getUTCMonth();
    const day = localTime.getUTCDate();
    const localDayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    return new Date(localDayStart.getTime() - TIMEZONE_OFFSET * 60 * 60 * 1000);
}

function formatDate(date) {
    return new Date(date).toISOString();
}

function formatLocalDate(date) {
    const d = new Date(new Date(date).getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 关键函数：将 hourlyUsage 从 UTC 时间转换为本地时间
function convertHourlyUsageToLocal(hourlyUsage, utcDate) {
    const newHourlyUsage = Array(24).fill(0);

    // 对于每个小时的数据
    for (let utcHour = 0; utcHour < 24; utcHour++) {
        if (hourlyUsage[utcHour] > 0) {
            // 计算这个 UTC 小时对应的本地时间
            const utcTimestamp = new Date(utcDate);
            utcTimestamp.setUTCHours(utcHour, 0, 0, 0);

            // 转换为本地时间
            const localTimestamp = new Date(utcTimestamp.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

            // 获取本地时间的日期和小时
            const localYear = localTimestamp.getUTCFullYear();
            const localMonth = localTimestamp.getUTCMonth();
            const localDay = localTimestamp.getUTCDate();
            const localHour = localTimestamp.getUTCHours();

            // 计算目标日期（本地零点）
            const targetLocalDay = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0));
            const targetDate = new Date(targetLocalDay.getTime() - TIMEZONE_OFFSET * 60 * 60 * 1000);

            const minutes = Number(hourlyUsage[utcHour]) || 0;


        }
    }
}

// 生成器函数版本
function* convertHourlyUsageToLocalGen(hourlyUsage, utcDate) {
    for (let utcHour = 0; utcHour < 24; utcHour++) {
        if (hourlyUsage[utcHour] > 0) {
            const utcTimestamp = new Date(utcDate);
            utcTimestamp.setUTCHours(utcHour, 0, 0, 0);

            const localTimestamp = new Date(utcTimestamp.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

            const localYear = localTimestamp.getUTCFullYear();
            const localMonth = localTimestamp.getUTCMonth();
            const localDay = localTimestamp.getUTCDate();
            const localHour = localTimestamp.getUTCHours();

            const targetLocalDay = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0));
            const targetDate = new Date(targetLocalDay.getTime() - TIMEZONE_OFFSET * 60 * 60 * 1000);

            const minutes = Number(hourlyUsage[utcHour]) || 0;

            yield {
                targetDate,
                targetHour: localHour,
                minutes,
                sourceHour: utcHour
            };
        }
    }
}

async function migrateData() {
    try {
        console.log('='.repeat(80));
        console.log('数据迁移脚本：UTC 转 +8 时区（物理移动 hourlyUsage）');
        console.log('='.repeat(80));
        console.log();

        const DailyStat = mongoose.model('DailyStat');

        // 1. 扫描数据
        console.log('正在扫描数据库...\n');
        const allStats = await DailyStat.find({}).sort({ date: 1 });

        if (allStats.length === 0) {
            console.log('❌ 数据库中没有数据，无需迁移。');
            return;
        }

        console.log(`📊 找到 ${allStats.length} 条记录\n`);

        // 2. 分析数据移动
        console.log('📈 分析数据移动...\n');

        const moveAnalysis = [];
        for (const stat of allStats.slice(0, Math.min(5, allStats.length))) {
            const moves = [];
            for (const move of convertHourlyUsageToLocalGen(stat.hourlyUsage, stat.date)) {
                moves.push(move);
            }
            if (moves.length > 0) {
                moveAnalysis.push({
                    deviceId: stat.deviceId,
                    appName: stat.appName,
                    oldDate: formatLocalDate(stat.date),
                    moves
                });
            }
        }

        console.log('数据移动示例（前5条有数据的记录）：');
        moveAnalysis.forEach((analysis, idx) => {
            console.log(`\n${idx + 1}. ${analysis.deviceId} | ${analysis.appName} | ${analysis.oldDate}`);
            analysis.moves.forEach(move => {
                console.log(`   UTC ${move.sourceHour}时 (${move.minutes}分) → ` +
                    `本地 ${formatLocalDate(move.targetDate)} ${move.targetHour}时`);
            });
        });
        console.log();

        // 3. 确认执行
        console.log('='.repeat(80));
        console.log('⚠️  重要提示：');
        console.log('1. 此操作将物理移动 hourlyUsage 数据到正确的本地时间位置');
        console.log('2. 数据会按照 +8 时区重新分配到正确的日期和小时');
        console.log('3. 建议先备份数据库');
        console.log('4. 如果数据跨天，会自动合并到正确的日期记录');
        console.log('='.repeat(80));
        console.log();

        const answer = await question('确认执行迁移？(yes/no): ');

        if (answer.toLowerCase() !== 'yes') {
            console.log('\n❌ 迁移已取消');
            return;
        }

        // 4. 执行迁移
        console.log('\n开始迁移...\n');

        // 临时存储：设备_应用_新日期 -> hourlyUsage
        const newRecords = new Map();
        let processedCount = 0;

        // 第一步：收集所有需要移动的数据
        for (const stat of allStats) {
            for (const move of convertHourlyUsageToLocalGen(stat.hourlyUsage, stat.date)) {
                const key = `${stat.deviceId}_${stat.appName}_${formatDate(move.targetDate)}`;

                if (!newRecords.has(key)) {
                    newRecords.set(key, {
                        deviceId: stat.deviceId,
                        appName: stat.appName,
                        date: move.targetDate,
                        hourlyUsage: Array(24).fill(0)
                    });
                }

                const record = newRecords.get(key);
                record.hourlyUsage[move.targetHour] += move.minutes;
            }

            processedCount++;
            const progress = Math.floor((processedCount / allStats.length) * 100);
            process.stdout.write(`\r第一阶段 - 收集数据: ${progress}%`);
        }

        console.log(`\n\n收集完成，生成 ${newRecords.size} 条新记录\n`);

        // 第二步：删除所有旧记录
        console.log('第二阶段 - 清理旧数据...');
        const deleteResult = await DailyStat.deleteMany({});
        console.log(`✅ 删除了 ${deleteResult.deletedCount} 条旧记录\n`);

        // 第三步：插入新记录
        console.log('第三阶段 - 插入新数据...');
        let insertedCount = 0;

        for (const [key, record] of newRecords) {
            // 四舍五入到2位小数
            record.hourlyUsage = record.hourlyUsage.map(v =>
                Math.round(v * 100) / 100
            );

            await DailyStat.create(record);
            insertedCount++;

            const progress = Math.floor((insertedCount / newRecords.size) * 100);
            process.stdout.write(`\r插入新数据: ${progress}%`);
        }

        console.log('\n\n='.repeat(80));
        console.log('✅ 迁移完成！');
        console.log('='.repeat(80));
        console.log(`📊 统计：`);
        console.log(`   - 原始记录数：${allStats.length}`);
        console.log(`   - 删除记录数：${deleteResult.deletedCount}`);
        console.log(`   - 新记录数：${insertedCount}`);
        console.log(`   - 差异：${insertedCount - allStats.length} (负数表示合并，正数表示拆分)`);
        console.log('='.repeat(80));

        // 5. 验证结果
        console.log('\n验证迁移结果...\n');
        const verifyStats = await DailyStat.find({}).sort({ date: 1 }).limit(5);

        console.log('迁移后的数据示例（前5条）：');
        verifyStats.forEach(stat => {
            const total = stat.hourlyUsage.reduce((sum, val) => sum + val, 0);
            const nonZero = stat.hourlyUsage
                .map((v, i) => v > 0 ? `${i}时:${v}分` : '')
                .filter(s => s)
                .join(', ');

            console.log(`\n${stat.deviceId} | ${stat.appName}`);
            console.log(`  日期: ${formatLocalDate(stat.date)} (UTC: ${formatDate(stat.date)})`);
            console.log(`  总计: ${total.toFixed(2)} 分钟`);
            console.log(`  分布: ${nonZero || '无数据'}`);
        });

    } catch (error) {
        console.error('\n❌ 迁移过程中发生错误：', error);
        throw error;
    }
}

async function main() {
    try {
        await migrateData();
    } catch (error) {
        console.error('脚本执行失败：', error);
        process.exit(1);
    } finally {
        rl.close();
        await mongoose.connection.close();
        console.log('\n数据库连接已关闭');
        process.exit(0);
    }
}

main();