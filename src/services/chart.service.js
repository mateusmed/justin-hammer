const { fetchTimeSeries, fetchMetricValue } = require('./database.service.js');

async function buildChart(params, queryParameter, chartConfigItem){

    const { range = '1h', aggregate, temporal } = queryParameter;

    if (temporal) {

        const startTimestamp = getTimeStart(range);
        const bucketSizeMs = getBucketSizeByAggregationParameter(aggregate);

        return buildTemporalChartDatasets(chartConfigItem.chart, queryParameter, startTimestamp, bucketSizeMs);

    }

    return await buildChartDatasets(chartConfigItem.chart, queryParameter);
}
async function buildChartDatasets(chartConfig, queryParameter) {

    let finalChart = JSON.parse(JSON.stringify(chartConfig));

    const namePodFilter = queryParameter.namePod || null;

    for (let datasetObj of finalChart.datasets) {
        let promiseList = [];

        for (let dataItem of datasetObj.data) {
            const labelFilters = {};
            

            if(dataItem.labelFilter){
                Object.assign(labelFilters, dataItem.labelFilter);
            }

            if(finalChart.filters){
                for (const filter of finalChart.filters) {
                    const queryValue = queryParameter[filter.key];
                    if (queryValue && queryValue !== 'All') {

                        labelFilters[filter.key]= queryValue;
                        filter.selected=queryValue;
                    }
                }
            }

            const promise = fetchMetricValue(datasetObj.metric, labelFilters, namePodFilter);
            promiseList.push(promise);
        }

        const results = await Promise.all(promiseList);
        datasetObj.data = results;
    }

    return finalChart;
}

async function buildTemporalChartDatasets(chartConfig,
                                          queryParameter,
                                          startTime,
                                          bucketSizeMs) {

    let  finalChart = JSON.parse(JSON.stringify(chartConfig));
    let allNewDatasets = [];
    let chartLabels = [];

    const namePodFilter = queryParameter.namePod || null;

    for (const datasetObj of finalChart.datasets) {

        const promiseList = [];
        const dataItems = datasetObj.data;

        for (const dataItem of dataItems) {
            const labelFilters = {};

            if (dataItem.labelFilter) {
                Object.assign(labelFilters, dataItem.labelFilter);
            }

            if (chartConfig.filters) {
                for (const filter of chartConfig.filters) {
                    const queryValue = queryParameter[filter.key];
                    if (queryValue && queryValue !== 'All') {

                        //TODO ESSA PARTE AQUI NAO ESTA FUNCIONANDO
                        let obj = {};
                        obj[filter.key]= queryValue;
                        filter.selected=queryValue;
                    }
                }
            }

            const promise = fetchTimeSeries({
                metric: datasetObj.metric,
                startTime,
                bucketSizeMs,
                labelFilters: labelFilters,
                namePod: namePodFilter
            })

            promiseList.push(promise);
        }

        const results = await Promise.all(promiseList);

        if (chartLabels.length === 0) {
            chartLabels = extractChartLabels(results);
        }

        const consolidatedDataset = consolidateResults(results, datasetObj);
        allNewDatasets.push(consolidatedDataset);

    }

    finalChart.datasets = allNewDatasets;
    finalChart.labels = chartLabels;

    return finalChart;
}

function consolidateResults(results, datasetObj) {
    const { data, ...metadata } = datasetObj;

    // Assumindo que todos os results têm o mesmo conjunto de timestamps
    const numPoints = results[0].length;
    const consolidated = [];

    for (let i = 0; i < numPoints; i++) {
        const valuesAtTimestamp = results.map(series => series[i].value);
        // exemplo com média:
        const avg = valuesAtTimestamp.reduce((a, b) => a + b, 0) / valuesAtTimestamp.length;
        consolidated.push(avg);
    }

    return {
        ...metadata,
        data: consolidated
    };
}


function extractChartLabels(results) {
    if (results.length > 0 && results[0].length > 0) {
        return results[0].map(point => new Date(point.timestamp).toLocaleTimeString());
    }
    return [];
}


function getTimeStart(range) {
    const now = Date.now();
    const rangeUnit = range.charAt(range.length - 1);
    const rangeValue = parseInt(range.slice(0, -1), 10);

    switch (rangeUnit) {
        case 'm':
            return now - rangeValue * 60 * 1000;

        case 'h':
            return now - rangeValue * 60 * 60 * 1000;

        case 'd':
            return now - rangeValue * 24 * 60 * 60 * 1000;

        default:
            return now - 60 * 60 * 1000; // Default to 1 hour
    }
}

function getBucketSizeByAggregationParameter(aggregate) {
    let bucketSizeMs = 0;
    if (aggregate) {
        const aggUnit = aggregate.charAt(aggregate.length - 1);
        const aggValue = parseInt(aggregate.slice(0, -1), 10);
        switch (aggUnit) {
            case 's':
                bucketSizeMs = aggValue * 1000;
                break;
            case 'm':
                bucketSizeMs = aggValue * 60 * 1000;
                break;
            case 'h':
                bucketSizeMs = aggValue * 60 * 60 * 1000;
                break;
        }
    }
    return bucketSizeMs;
}



module.exports = {
    buildChart
};