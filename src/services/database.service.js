const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

const initializeDatabase = () => {
    // If instance already exists, return it
    if (dbInstance) {
        return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
        // Use environment variable for DB path in production, with a fallback for local development.
        const dbPath = process.env.DB_PATH || path.join(path.resolve('database'), 'metrics.db');
        const dbDir = path.dirname(dbPath);

        // Ensure the database directory exists.
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`[Database] Created directory at ${dbDir}`);
        }

        const db = new (sqlite3.verbose().Database)(dbPath, (err) => {
            if (err) {
                console.error('[Database] Error opening database:', err.message);
                return reject(err);
            }
            console.log('[Database] Connection established.');
        });

        const INITIALIZE_SCHEMA = `
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                name TEXT NOT NULL,
                labels TEXT, -- JSON object as a string
                value REAL NOT NULL,
                namePod TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_name_timestamp ON metrics (name, timestamp);
        `;

        db.exec(INITIALIZE_SCHEMA, (err) => {
            if (err) {
                console.error('[Database] Error creating schema:', err.message);
                return reject(err);
            }
            console.log('[Database] Schema initialized successfully.');
            dbInstance = db; // Cache the instance
            resolve(dbInstance);
        });
    });
};

const getDb = () => {
    if (!dbInstance) {
        throw new Error('Database has not been initialized. Call initializeDatabase first.');
    }
    return dbInstance;
};

const fetchMetricValue = (metricName, labelFilters, namePod = null) => {

    return new Promise((resolve, reject) => {
        const db = getDb();

        let query = `
            SELECT value
            FROM metrics
            WHERE name = ?
        `;

        const params = [metricName];

        for (const [key, value] of Object.entries(labelFilters)) {
            query += ` AND json_extract(labels, '$.${key}') = ?`;
            params.push(value);
        }

        if (namePod) {
            query += ` AND namePod = ?`;
            params.push(namePod);
        }

        query += `
            ORDER BY timestamp DESC
        `;

        logFormattedQuery(query, params);

        // Use db.get for single-row queries for efficiency
        db.get(query, params, (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row ? row.value : 0);
        });
    });
};

function logFormattedQuery(query, params) {
    const queryParts = query.split('?');

    if (queryParts.length - 1 !== params.length) {
        console.log('\n---------------------\n');
        console.error('[Database] Error formatting query: Mismatch between placeholders (?) and parameters.');
        console.log('Query:', query);
        console.log('Params:', params);
        console.log('\n---------------------\n');
        return;
    }

    let formattedQuery = queryParts[0];
    for (let i = 0; i < params.length; i++) {
        const param = params[i];
        // For logging, escape single quotes in strings and wrap them in quotes.
        const paramValue = typeof param === 'string' 
            ? `'${param.replace(/'/g, "''")}'` 
            : param;
        formattedQuery += paramValue + queryParts[i + 1];
    }

    console.log('\n---------------------\n');
    console.log('[Database] Formatted Query for logging:\n', formattedQuery);
    console.log('\n---------------------\n');
}

const fetchTimeSeries = ({ metric,
                           startTime,
                           bucketSizeMs = 0,
                           labelFilters = {},
                           namePod = null
                         }) => {

    return new Promise((resolve, reject) => {
        const db = getDb();
        let query;
        const params = [];
        let filterConditions = '';

        for (const [key, value] of Object.entries(labelFilters)) {
            filterConditions += ` AND json_extract(labels, '$.${key}') = ?`;
            params.push(value);
        }

        if (namePod) {
            filterConditions += ` AND namePod = ?`;
            params.push(namePod);
        }

        if (bucketSizeMs > 0) {
            query = `
                SELECT
                    (timestamp / ?) * ? as timestamp,
                    AVG(value) as value
                FROM metrics
                WHERE name = ? AND timestamp > ? ${filterConditions}
                GROUP BY 1
                ORDER BY 1 ASC
            `;
            params.unshift(bucketSizeMs, bucketSizeMs, metric, startTime);
        } else {
            query = `
                SELECT timestamp, value
                FROM metrics
                WHERE name = ? AND timestamp > ? ${filterConditions}
                ORDER BY timestamp ASC
            `;
            params.unshift(metric, startTime);
        }

        logFormattedQuery(query, params);

        db.all(query, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows);
        });
    });
};

const getDbFileSize = async () => {
    const dbPath = process.env.DB_PATH || path.join(path.resolve('database'), 'metrics.db');
    try {
        const stats = await fs.stat(dbPath);
        return stats.size; // Size in bytes
    } catch (error) {
        console.error('[Database] Error getting database file size:', error.message);
        return 0;
    }
};

const deleteOldestMetrics = (maxDbSizeMB) => {
    return new Promise(async (resolve, reject) => {
        const db = getDb();
        const targetSizeBytes = maxDbSizeMB * 0.75 * 1024 * 1024; // Target 75% of max size

        try {
            let currentSize = await getDbFileSize();
            console.log(`[Database Cleanup] Current DB size: ${(currentSize / (1024 * 1024)).toFixed(2)} MB. Max allowed: ${maxDbSizeMB} MB. Target after cleanup: ${(targetSizeBytes / (1024 * 1024)).toFixed(2)} MB.`);

            if (currentSize <= maxDbSizeMB * 1024 * 1024) { // Only trigger if it exceeds the max limit
                console.log('[Database Cleanup] DB size is within max limits. No cleanup needed yet.');
                return resolve();
            }

            console.log('[Database Cleanup] DB size exceeds max limit. Starting cleanup...');

            const totalRecordsRow = await new Promise((res, rej) => {
                db.get('SELECT COUNT(*) as count FROM metrics', (err, row) => {
                    if (err) rej(err);
                    else res(row);
                });
            });
            const totalRecords = totalRecordsRow ? totalRecordsRow.count : 0;

            if (totalRecords === 0) {
                console.log('[Database Cleanup] No records to clean up.');
                return resolve();
            }

            const recordsToDeleteCount = Math.floor(totalRecords * 0.25); // Delete 25% of current records

            if (recordsToDeleteCount === 0) {
                console.log('[Database Cleanup] Not enough records to delete for cleanup.');
                return resolve();
            }

            const thresholdTimestampRow = await new Promise((res, rej) => {
                db.get(`SELECT timestamp FROM metrics ORDER BY timestamp ASC LIMIT 1 OFFSET ?`, [recordsToDeleteCount], (err, row) => {
                    if (err) rej(err); 
                    else res(row);
                });
            });

            if (!thresholdTimestampRow || !thresholdTimestampRow.timestamp) {
                console.log('[Database Cleanup] Could not determine deletion threshold timestamp.');
                return resolve();
            }

            const deleteBeforeTimestamp = thresholdTimestampRow.timestamp;

            const deleteResult = await new Promise((res, rej) => {
                db.run('DELETE FROM metrics WHERE timestamp < ?', [deleteBeforeTimestamp], function(err) {
                    if (err) rej(err);
                    else res(this.changes);
                });
            });
            console.log(`[Database Cleanup] Deleted ${deleteResult} records older than ${new Date(deleteBeforeTimestamp).toISOString()}.`);

            await new Promise((res, rej) => {
                db.run('VACUUM', (err) => {
                    if (err) rej(err);
                    else res();
                });
            });
            console.log('[Database Cleanup] Database vacuumed.');

            currentSize = await getDbFileSize();
            console.log(`[Database Cleanup] Final DB size: ${(currentSize / (1024 * 1024)).toFixed(2)} MB.`);
            resolve();

        } catch (error) {
            console.error('[Database Cleanup] Error during cleanup:', error);
            reject(error);
        }
    });
};


module.exports = { initializeDatabase,
                   getDb,
                   fetchMetricValue,
                   fetchTimeSeries,
                   getDbFileSize,
                   deleteOldestMetrics };