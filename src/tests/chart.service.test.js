const {
    buildChartLine,
    buildQueryForChart,
    getTimeStart,
    getBucketSizeByAggregationParameter
} = require('./another.service.js');


const { getDb } = require('../services/database.service.js');

// Mocking the database utility
jest.mock('./database.service.js', () => ({
    getDb: jest.fn(),
}));

describe('another.service.js', () => {

    const mockDbAll = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        getDb.mockReturnValue({ all: mockDbAll });

        // buildChartLine still appears to use a global db object.
        // We define it globally here to make its tests work.
        global.db = { all: mockDbAll };
    });

    //TODO VERIFICAR MELHOR A ESTRUTURA DA EXECUÇÃO DAS QUERIES (NAO FUNCIONANDO SALVANDO PARA PROGRESSO)
    describe('buildQueryForChart', () => {

        test('should build and execute queries for each data point', async () => {
            const chartConfig = {
                type: "bar",
                labels: ["401", "404", "500", "501"],
                datasets: [
                        {
                            metric: 'proxy_responses_total',
                            data: [
                                { labelFilter: { status: '401' } },
                                { labelFilter: { status: '404' } }
                            ]
                        },
                        {
                            metric: 'proxy_responses_total',
                            data: [
                                { labelFilter: { status: '500' } },
                                { labelFilter: { status: '501' } }
                            ]
                        },
                    ],
                filters: [
                    {
                        "type": "selectItem",
                        "label": "Method",
                        "key": "method",
                        "options": ["All", "POST", "GET"],
                        "selected": "POST"
                    }
                ]
            };

            mockDbAll
                .mockImplementationOnce((query, params, callback) => callback(null, [{ value: 10 }, { value: 20 }]))
                .mockImplementationOnce((query, params, callback) => callback(null, [{ value: 30 }, { value: 40 }]));

            // Pass an empty object for queryParameter
            const result = await buildQueryForChart(chartConfig, { method: "POST"});

            expect(mockDbAll).toHaveBeenCalledTimes(2);
            expect(result[0].data).toBe(10);
            expect(result[1].data).toBe(20);
        });

        test('should include query parameters in the query', async () => {
            const chartConfig = {
                datasets: [{
                    metric: 'proxy_requests_cloud_total',
                    data: [{ labelFilter: { cloud_name: 'azure-open-ai' } }]
                }],
                filters: [{ key: 'method' }]
            };

            const queryParameter = { method: 'POST' };

            mockDbAll.mockImplementation((query, params, callback) => {
                callback(null, [{ value: 55 }]);
            });

            await buildQueryForChart(chartConfig, queryParameter);

            expect(mockDbAll).toHaveBeenCalledTimes(1);

            const [query, params] = mockDbAll.mock.calls[0];

            expect(query).toContain("json_extract(labels, '$.method') = ?");
            expect(query).toContain("json_extract(labels, '$.cloud_name') = ?");
            expect(params).toEqual(['proxy_requests_cloud_total', 'POST', 'azure-open-ai']);
        });
    });


    // describe('getTimeStart', () => {
    //     const MOCK_DATE_NOW = 1672531200000; // 2023-01-01 00:00:00 UTC
    //
    //     beforeAll(() => {
    //         jest.spyOn(Date, 'now').mockImplementation(() => MOCK_DATE_NOW);
    //     });
    //
    //     afterAll(() => {
    //         jest.restoreAllMocks();
    //     });
    //
    //     test('should return timestamp for 1 minute ago', () => {
    //         expect(getTimeStart('1m')).toBe(MOCK_DATE_NOW - 60 * 1000);
    //     });
    //
    //     test('should return timestamp for 2 hours ago', () => {
    //         expect(getTimeStart('2h')).toBe(MOCK_DATE_NOW - 2 * 60 * 60 * 1000);
    //     });
    //
    //     test('should return timestamp for 7 days ago', () => {
    //         expect(getTimeStart('7d')).toBe(MOCK_DATE_NOW - 7 * 24 * 60 * 60 * 1000);
    //     });
    //
    //     test('should default to 1 hour for invalid range', () => {
    //         expect(getTimeStart('invalid')).toBe(MOCK_DATE_NOW - 60 * 60 * 1000);
    //     });
    // });
    //
    // describe('getBucketSizeByAggregationParameter', () => {
    //     test('should return bucket size in ms for seconds', () => {
    //         expect(getBucketSizeByAggregationParameter('30s')).toBe(30000);
    //     });
    //
    //     test('should return bucket size in ms for minutes', () => {
    //         expect(getBucketSizeByAggregationParameter('5m')).toBe(5 * 60 * 1000);
    //     });
    //
    //     test('should return 0 for null or invalid aggregate', () => {
    //         expect(getBucketSizeByAggregationParameter(null)).toBe(0);
    //     });
    // });
    //
    //
    // describe('buildChartLine', () => {
    //     const datasetConfig = { metric: 'cpu_load' };
    //     const startTimestamp = 1672531200000;
    //
    //     test('should build a simple query without aggregation', async () => {
    //         mockDbAll.mockImplementation((query, params, callback) => callback(null, []));
    //
    //         await buildChartLine(datasetConfig, startTimestamp, 0);
    //
    //         const [query] = mockDbAll.mock.calls[0];
    //         expect(query).not.toContain('AVG(value)');
    //         expect(query).toContain('ORDER BY timestamp ASC');
    //     });
    //
    //     test('should build an aggregation query when bucketSizeMs > 0', async () => {
    //         mockDbAll.mockImplementation((query, params, callback) => callback(null, []));
    //
    //         const bucketSizeMs = 60000;
    //         await buildChartLine(datasetConfig, startTimestamp, bucketSizeMs);
    //
    //         const [query, params] = mockDbAll.mock.calls[0];
    //
    //         expect(query).toContain('AVG(value) as value');
    //         expect(query).toContain('GROUP BY 1');
    //         expect(params[0]).toBe(bucketSizeMs);
    //         expect(params[1]).toBe(bucketSizeMs);
    //     });
    //
    //     test('should reject promise on database error', async () => {
    //         const dbError = new Error('DB Failure');
    //         mockDbAll.mockImplementation((query, params, callback) => callback(dbError, null));
    //
    //         await expect(buildChartLine(datasetConfig, startTimestamp, 0)).rejects.toThrow(dbError);
    //     });
    // });
});
