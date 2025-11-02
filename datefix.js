// fix_date_add_one_day.js - 将所有记录的日期加1天
const { mongoose } = require('./index');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        rl.question(query, resolve);
    });
}

function formatDate(date) {
    return new Date(date).toISOString();
}

function formatLocalDate(date, offset = 8) {
    const d = new Date(new Date(date).getTime() + offset * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fixDates() {
    try {
        console.log('='.repeat(80));
        console.log('日期修正脚本 - 所有记录日期加 1 天');
        console.log('='.repeat(80));
        console.log();

        const DailyStat = mongoose.model('DailyStat');

        // 1. 统计数据
        console.log('正在扫描数据库...\n');
        const allStats = await DailyStat.find({}).sort({ date: 1 });

        if (allStats.length === 0) {
            console.log('❌ 数据库中没有数据。');
            return;
        }

        console.log(`📊 找到 ${allStats.length} 条记录\n`);

        // 2. 显示日期范围
        const firstDate = allStats[0].date;
        const lastDate = allStats[allStats.length - 1].date;

        console.log('当前日期范围：');
        console.log(`  最早: ${formatLocalDate(firstDate)} (UTC: ${formatDate(firstDate)})`);
        console.log(`  最晚: ${formatLocalDate(lastDate)} (UTC: ${formatDate(lastDate)})`);
        console.log();

        // 3. 显示修改后的日期范围
        const newFirstDate = new Date(firstDate.getTime() + 24 * 60 * 60 * 1000);
        const newLastDate = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);

        console.log('修改后日期范围：');
        console.log(`  最早: ${formatLocalDate(newFirstDate)} (UTC: ${formatDate(newFirstDate)})`);
        console.log(`  最晚: ${formatLocalDate(newLastDate)} (UTC: ${formatDate(newLastDate)})`);
        console.log();

        // 4. 显示前5条记录的变化
        console.log('前5条记录的日期变化：');
        console.log('-'.repeat(80));
        for (let i = 0; i < Math.min(5, allStats.length); i++) {
            const stat = allStats[i];
            const oldDate = stat.date;
            const newDate = new Date(oldDate.getTime() + 24 * 60 * 60 * 1000);

            console.log(`记录 ${i + 1}: ${stat.deviceId} | ${stat.appName}`);
            console.log(`  旧: ${formatLocalDate(oldDate)} (${formatDate(oldDate)})`);
            console.log(`  新: ${formatLocalDate(newDate)} (${formatDate(newDate)})`);
            console.log();
        }

        // 5. 统计设备
        const deviceCount = new Map();
        allStats.forEach(stat => {
            deviceCount.set(stat.deviceId, (deviceCount.get(stat.deviceId) || 0) + 1);
        });

        console.log('设备统计：');
        deviceCount.forEach((count, deviceId) => {
            console.log(`  ${deviceId}: ${count} 条记录`);
        });
        console.log();

        // 6. 确认执行
        console.log('='.repeat(80));
        console.log('⚠️  重要提示：');
        console.log('1. 此操作将修改所有记录的 date 字段');
        console.log('2. 每条记录的日期将增加 24 小时（1天）');
        console.log('3. hourlyUsage 和其他字段保持不变');
        console.log('4. 建议先备份数据库');
        console.log('='.repeat(80));
        console.log();

        const answer = await question('确认执行修正？(yes/no): ');

        if (answer.toLowerCase() !== 'yes') {
            console.log('\n❌ 修正已取消');
            return;
        }

        // 7. 执行修正
        console.log('\n开始修正...\n');
        let updatedCount = 0;
        let errorCount = 0;

        for (const stat of allStats) {
            try {
                // 只修改日期，加1天（24小时）
                stat.date = new Date(stat.date.getTime() + 24 * 60 * 60 * 1000);
                await stat.save();
                updatedCount++;

                // 进度显示
                const progress = Math.floor((updatedCount / allStats.length) * 100);
                process.stdout.write(`\r进度: ${progress}% (${updatedCount}/${allStats.length})`);

            } catch (error) {
                errorCount++;
                console.error(`\n错误处理记录 ${stat._id}: ${error.message}`);
            }
        }

        console.log('\n\n='.repeat(80));
        console.log('✅ 修正完成！');
        console.log('='.repeat(80));
        console.log(`📊 统计：`);
        console.log(`   - 成功修正：${updatedCount} 条`);
        console.log(`   - 失败记录：${errorCount} 条`);
        console.log('='.repeat(80));

        // 8. 验证结果
        console.log('\n验证修正结果...\n');
        const verifyStats = await DailyStat.find({}).sort({ date: 1 });

        if (verifyStats.length > 0) {
            const verifyFirst = verifyStats[0].date;
            const verifyLast = verifyStats[verifyStats.length - 1].date;

            console.log('修正后的日期范围：');
            console.log(`  最早: ${formatLocalDate(verifyFirst)} (UTC: ${formatDate(verifyFirst)})`);
            console.log(`  最晚: ${formatLocalDate(verifyLast)} (UTC: ${formatDate(verifyLast)})`);
            console.log();

            console.log('修正后的数据示例（前5条）：');
            for (let i = 0; i < Math.min(5, verifyStats.length); i++) {
                const stat = verifyStats[i];
                const total = stat.hourlyUsage.reduce((sum, val) => sum + val, 0);

                console.log(`\n记录 ${i + 1}:`);
                console.log(`  设备: ${stat.deviceId} | 应用: ${stat.appName}`);
                console.log(`  日期: ${formatLocalDate(stat.date)} (UTC: ${formatDate(stat.date)})`);
                console.log(`  总使用: ${total.toFixed(2)} 分钟`);
            }
        }

    } catch (error) {
        console.error('\n❌ 修正过程中发生错误：', error);
        throw error;
    }
}

async function main() {
    try {
        await fixDates();
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