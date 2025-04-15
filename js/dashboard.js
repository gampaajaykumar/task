document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard initialization started');

    try {
        // Verify authentication
        const userId = localStorage.getItem('user_id');
        if (!userId) {
            window.location.href = 'index.html';
            return;
        }

        // Initialize the current date display
        updateDateDisplay();

        // Load and display data
        await loadAndDisplayHealthData();

        // Set up chart controls
        document.getElementById('chart-metric')?.addEventListener('change', () => {
            fetchHealthMetrics().then(initializeHealthChart);
        });

        document.getElementById('chart-period')?.addEventListener('change', () => {
            fetchHealthMetrics().then(initializeHealthChart);
        });

        // Logout button
        document.getElementById('logout')?.addEventListener('click', function (e) {
            e.preventDefault();
            logoutUser();
        });

        async function logoutUser() {
            try {
                const response = await fetch('/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': localStorage.getItem('user_id')
                    }
                });

                if (!response.ok) {
                    throw new Error('Logout failed');
                }

                localStorage.removeItem('user_id');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert('Failed to logout. Please try again.');
            }
        }
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        showErrorState('Failed to initialize dashboard');
    }
});

let healthChart = null;

// Update date display in welcome banner
function updateDateDisplay() {
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.innerHTML = `<i class="fas fa-calendar-day"></i> ${now.toLocaleDateString('en-US', options)}`;
    }
}

async function loadAndDisplayHealthData() {
    showLoadingState(true);

    try {
        const metrics = await fetchHealthMetrics();

        if (!metrics?.length) {
            showNoDataState();
            return;
        }

        updateSummaryCards(metrics);
        initializeHealthChart(metrics);

    } catch (error) {
        console.error('Data loading failed:', error);
        showErrorState('Failed to load health data');
    } finally {
        showLoadingState(false);
    }
}

async function fetchHealthMetrics() {
    try {
        const response = await fetch('/metrics', {
            headers: { 'X-User-ID': localStorage.getItem('user_id') }
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Invalid metrics data format');
        }

        return data;
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
    }
}

function updateSummaryCards(metrics) {
    try {
        // Update weight summary
        const weightMetrics = metrics.filter(m => m.metric_type === 'Weight');
        updateSummaryCard('weight-summary', 'weight-trend', weightMetrics);

        // Update blood pressure summary
        const bpMetrics = metrics.filter(m => m.metric_type === 'Blood Pressure');
        updateSummaryCard('bp-summary', 'bp-trend', bpMetrics);

        // Update blood sugar summary
        const sugarMetrics = metrics.filter(m => m.metric_type === 'Blood Sugar');
        updateSummaryCard('sugar-summary', 'sugar-trend', sugarMetrics);
    } catch (error) {
        console.error('Error updating summary cards:', error);
        throw error;
    }
}

function updateSummaryCard(valueId, trendId, metrics) {
    const valueElement = document.getElementById(valueId);
    const trendElement = document.getElementById(trendId);

    if (!valueElement || !trendElement) return;

    if (!metrics.length) {
        valueElement.textContent = 'No data';
        trendElement.innerHTML = '<span class="neutral"><i class="fas fa-minus"></i></span>';
        return;
    }

    // Sort by date, most recent first
    metrics.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

    // Get latest reading
    const latest = metrics[0];
    const date = new Date(latest.recorded_at);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    valueElement.innerHTML = `
        <span class="value">${latest.value} ${latest.unit}</span>
        <span class="date">${formattedDate}</span>
    `;

    // Calculate trend if we have previous data
    if (metrics.length > 1) {
        const previous = metrics[1];
        let currentValue, previousValue;
        
        // Handle blood pressure which has format like "120/80"
        if (latest.metric_type === 'Blood Pressure') {
            currentValue = parseInt(latest.value.split('/')[0]);
            previousValue = parseInt(previous.value.split('/')[0]);
        } else {
            currentValue = parseFloat(latest.value);
            previousValue = parseFloat(previous.value);
        }

        if (!isNaN(currentValue) && !isNaN(previousValue) && previousValue !== 0) {
            const diff = ((currentValue - previousValue) / previousValue) * 100;
            const trendClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
            
            // For weight, up is bad and down is good
            const isPositive = latest.metric_type === 'Weight' ? diff < 0 : diff > 0;
            const trendIcon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
            
            // Add appropriate messaging
            let trendMessage = '';
            if (latest.metric_type === 'Weight') {
                trendMessage = diff < 0 ? 'decreased' : 'increased';
            } else if (latest.metric_type === 'Blood Pressure') {
                trendMessage = diff < 0 ? 'lower' : 'higher';
            } else {
                trendMessage = diff < 0 ? 'decreased' : 'increased';
            }

            trendElement.innerHTML = `
                <span class="${trendClass}">
                    <i class="fas ${trendIcon}"></i> ${Math.abs(diff).toFixed(1)}% ${trendMessage}
                </span>
                <span class="trend-date">since ${new Date(previous.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            `;
        } else {
            trendElement.innerHTML = '<span class="neutral"><i class="fas fa-minus"></i> No change</span>';
        }
    } else {
        trendElement.innerHTML = '<span class="neutral"><i class="fas fa-minus"></i> No previous data</span>';
    }
}

async function initializeHealthChart() {
    try {
        const ctx = document.getElementById('health-trend-chart');
        if (!ctx) return;

        // Destroy previous chart if exists
        if (window.healthChart) {
            window.healthChart.destroy();
        }

        // Show loading state
        document.getElementById('chart-trend-value').textContent = 'Loading data...';

        // Get selected filters
        const metricType = document.getElementById('chart-metric').value;
        const days = parseInt(document.getElementById('chart-period').value);

        // Fetch metrics data
        const metrics = await fetchHealthMetrics();
        const filteredMetrics = metrics.filter(m => m.metric_type === metricType);

        if (filteredMetrics.length === 0) {
            document.getElementById('chart-trend-value').textContent = 'No data available for this metric type.';
            return;
        }

        // Process data for chart
        const { labels, values } = processChartData(filteredMetrics, days);

        // Create the chart
        window.healthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${metricType} Trend`,
                    data: values,
                    backgroundColor: getMetricBackgroundColor(metricType),
                    borderColor: getMetricColor(metricType),
                    borderWidth: 2,
                    pointBackgroundColor: getMetricColor(metricType),
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#212529',
                        bodyColor: '#212529',
                        borderColor: 'rgba(0, 0, 0, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw} ${getMetricUnit(metricType)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            borderDash: [5, 5]
                        },
                        ticks: {
                            callback: function(value) {
                                return `${value} ${getMetricUnit(metricType)}`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                elements: {
                    line: {
                        tension: 0.4
                    }
                }
            }
        });

        // Update trend insight
        updateTrendInsight(filteredMetrics, metricType);

    } catch (error) {
        console.error('Chart initialization error:', error);
        document.getElementById('chart-trend-value').textContent = 'Failed to load chart data.';
    }
}

function updateTrendInsight(metrics, metricType) {
    const insightElement = document.getElementById('chart-trend-value');
    if (!insightElement) return;
    
    if (metrics.length <= 1) {
        insightElement.textContent = 'Not enough data to analyze trends.';
        return;
    }

    // Sort metrics by date (oldest first for trend analysis)
    metrics.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    
    // Extract values for analysis
    let values = [];
    
    if (metricType === 'Blood Pressure') {
        // For BP, use the systolic (top) number
        values = metrics.map(m => parseInt(m.value.split('/')[0]));
    } else {
        values = metrics.map(m => parseFloat(m.value));
    }
    
    // Calculate trend
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const percentChange = ((lastValue - firstValue) / firstValue) * 100;
    
    // Calculate average
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate variance (how much values fluctuate)
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    const variabilityPercent = (standardDeviation / average) * 100;
    
    // Generate insight based on metric type
    let insight = '';
    
    if (metricType === 'Weight') {
        if (Math.abs(percentChange) < 1) {
            insight = `Your weight has remained stable over this period, with an average of ${average.toFixed(1)} kg.`;
        } else if (percentChange < 0) {
            insight = `Your weight has decreased by ${Math.abs(percentChange).toFixed(1)}% over this period.`;
        } else {
            insight = `Your weight has increased by ${percentChange.toFixed(1)}% over this period.`;
        }
        
        if (variabilityPercent > 5) {
            insight += ` There's significant variation in your readings (±${standardDeviation.toFixed(1)} kg).`;
        }
    } else if (metricType === 'Blood Pressure') {
        if (Math.abs(percentChange) < 5) {
            insight = `Your systolic blood pressure has been relatively stable, with an average of ${average.toFixed(0)} mmHg.`;
        } else if (percentChange < 0) {
            insight = `Your systolic blood pressure has decreased by ${Math.abs(percentChange).toFixed(1)}% over this period.`;
        } else {
            insight = `Your systolic blood pressure has increased by ${percentChange.toFixed(1)}% over this period.`;
        }
        
        // Add guidance based on the average reading
        if (average < 120) {
            insight += ` Your readings are within normal range.`;
        } else if (average < 130) {
            insight += ` Your readings are in the elevated range.`;
        } else {
            insight += ` Your readings are above the recommended range.`;
        }
    } else if (metricType === 'Blood Sugar') {
        if (Math.abs(percentChange) < 5) {
            insight = `Your blood sugar levels have been relatively stable, with an average of ${average.toFixed(0)} mg/dL.`;
        } else if (percentChange < 0) {
            insight = `Your blood sugar levels have decreased by ${Math.abs(percentChange).toFixed(1)}% over this period.`;
        } else {
            insight = `Your blood sugar levels have increased by ${percentChange.toFixed(1)}% over this period.`;
        }
        
        if (variabilityPercent > 15) {
            insight += ` There's significant variation in your readings (±${standardDeviation.toFixed(0)} mg/dL).`;
        }
    }
    
    insightElement.textContent = insight;
}

function processChartData(metrics, days) {
    // Sort by date (oldest first for chart data)
    metrics.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    
    // Filter by timeframe
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const filteredMetrics = metrics.filter(m => new Date(m.recorded_at) >= cutoffDate);
    
    const labels = [];
    const values = [];
    
    filteredMetrics.forEach(metric => {
        const date = new Date(metric.recorded_at);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        if (metric.metric_type === 'Blood Pressure') {
            // For BP, use the systolic (top) number
            const systolic = parseInt(metric.value.split('/')[0]);
            values.push(systolic);
        } else {
            values.push(parseFloat(metric.value));
        }
    });
    
    return { labels, values };
}

function getMetricColor(metricType) {
    switch (metricType) {
        case 'Weight': return 'rgba(58, 134, 255, 1)'; // Primary blue
        case 'Blood Pressure': return 'rgba(230, 57, 70, 1)'; // Red
        case 'Blood Sugar': return 'rgba(2, 195, 154, 1)'; // Green
        default: return 'rgba(108, 117, 125, 1)'; // Gray
    }
}

function getMetricBackgroundColor(metricType) {
    switch (metricType) {
        case 'Weight': return 'rgba(58, 134, 255, 0.1)';
        case 'Blood Pressure': return 'rgba(230, 57, 70, 0.1)';
        case 'Blood Sugar': return 'rgba(2, 195, 154, 0.1)';
        default: return 'rgba(108, 117, 125, 0.1)';
    }
}

function getMetricUnit(metricType) {
    switch (metricType) {
        case 'Weight': return 'kg';
        case 'Blood Pressure': return 'mmHg';
        case 'Blood Sugar': return 'mg/dL';
        case 'Heart Rate': return 'bpm';
        default: return '';
    }
}

function showLoadingState(show) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        if (show) {
            loadingOverlay.classList.add('active');
        } else {
            loadingOverlay.classList.remove('active');
        }
    }
}

function showNoDataState() {
    const cardsSection = document.querySelector('.health-overview');
    const chartSection = document.querySelector('.health-trends');
    
    if (cardsSection) {
        cardsSection.innerHTML = `
            <h2><i class="fas fa-clipboard-check"></i> Health Overview</h2>
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-chart-line"></i></div>
                <h3>No Health Data Yet</h3>
                <p>Start tracking your health metrics to see them here.</p>
                <a href="/metrics.html?add=new" class="button primary">
                    <i class="fas fa-plus"></i> Add Your First Reading
                </a>
            </div>
        `;
    }
    
    if (chartSection) {
        chartSection.style.display = 'none';
    }
}

function showErrorState(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        
        setTimeout(() => {
            errorElement.classList.remove('show');
        }, 5000);
    }
}

function showNotification(message, type = 'default') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            notification.classList.remove('show');
            notification.classList.remove('fade-out');
        }, 500);
    }, 4000);
}