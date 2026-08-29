// ==========================================
// STATE & GLOBAL PARAMETERS
// ==========================================
let state = {
    N: 1024,
    Ts: 0.01,
    a: 0.85,
    noiseLevel: 8.0,
    meanTraffic: 60.0,
    scenario: 'doc',
    timeRange: 300,
    x: [], // Input raw signal
    y: [], // Filtered output signal
    timeArr: [], // Time axis in seconds
    fftFreqs: [], // Frequencies for FFT
    fftMagX: [], // |X[k]|
    fftMagY: [], // |Y[k]|
    isStreaming: false,
    streamInterval: null
};

// Chart instances
let timeChart = null;
let fftChart = null;
let impulseChart = null;

// ==========================================
// INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    renderMath();
    initCharts();
    generateSignalAndProcess();
    drawZPlane();
});

function renderMath() {
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false
        });
    }
}

// ==========================================
// SIGNAL GENERATOR & DSP PIPELINE
// ==========================================
function generateSignalAndProcess() {
    const N = state.N;
    const Ts = state.Ts;
    const a = state.a;
    
    state.timeArr = new Array(N);
    state.x = new Array(N);
    state.y = new Array(N);

    // Pseudo-random Gaussian Noise generator (Box-Muller)
    function gaussianRandom(mean = 0, stdev = 1) {
        let u = 1 - Math.random();
        let v = Math.random();
        let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdev + mean;
    }

    // 1. Generate Input Signal x[n] based on Scenario
    for (let n = 0; n < N; n++) {
        const t = n * Ts;
        state.timeArr[n] = t;
        let val = state.meanTraffic;

        if (state.scenario === 'doc') {
            // Document CUN simulation: Low-frequency cycles (hours punta) + Gaussian noise
            // Periodicity matching Figure 1 (0.5 Hz & 1.2 Hz components)
            val += 14 * Math.sin(2 * Math.PI * 0.55 * t) + 7 * Math.cos(2 * Math.PI * 1.15 * t);
            val += gaussianRandom(0, state.noiseLevel);
        } else if (state.scenario === 'ddos') {
            // Sudden intense packet bursts
            val += 8 * Math.sin(2 * Math.PI * 0.3 * t);
            if (n > 80 && n < 180) val += 50; // Burst 1
            if (n > 350 && n < 420) val += 70; // Burst 2
            val += gaussianRandom(0, state.noiseLevel * 1.4);
        } else if (state.scenario === 'diurnal') {
            // Diurnal traffic cycle (smooth multi-harmonic)
            val += 25 * Math.sin(2 * Math.PI * 0.2 * t) + 12 * Math.sin(2 * Math.PI * 0.4 * t);
            val += gaussianRandom(0, state.noiseLevel * 0.7);
        } else if (state.scenario === 'step') {
            // Step load change
            val += (n > N / 3 ? 35 : 0);
            val += gaussianRandom(0, state.noiseLevel * 0.8);
        }

        state.x[n] = Math.max(0, val); // Non-negative traffic packets
    }

    // 2. Filter Signal: First-order low-pass filter (Exponential Moving Average / normalized single-pole)
    // y[n] = (1 - a)*x[n] + a*y[n-1] ensuring scale congruence with Figure 1 of CUN Report
    let yPrev = state.x[0];
    for (let n = 0; n < N; n++) {
        state.y[n] = (1 - a) * state.x[n] + a * yPrev;
        yPrev = state.y[n];
    }

    // 3. Frequency Spectrum via FFT
    computeFFT();

    // 4. Update UI & Charts
    updateKPIs();
    updateCharts();
    inspectSample(Math.min(150, Math.floor(N / 2)));
}

// ==========================================
// FAST FOURIER TRANSFORM (Cooley-Tukey Radix-2)
// ==========================================
function computeFFT() {
    const N = state.N;
    const Fs = 1 / state.Ts;
    const halfN = N / 2;

    function fftRadix2(re, im) {
        const n = re.length;
        if (n <= 1) return;

        let evenRe = new Float64Array(n / 2);
        let evenIm = new Float64Array(n / 2);
        let oddRe = new Float64Array(n / 2);
        let oddIm = new Float64Array(n / 2);

        for (let i = 0; i < n / 2; i++) {
            evenRe[i] = re[2 * i];
            evenIm[i] = im[2 * i];
            oddRe[i] = re[2 * i + 1];
            oddIm[i] = im[2 * i + 1];
        }

        fftRadix2(evenRe, evenIm);
        fftRadix2(oddRe, oddIm);

        for (let k = 0; k < n / 2; k++) {
            const angle = -2 * Math.PI * k / n;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const tRe = cosA * oddRe[k] - sinA * oddIm[k];
            const tIm = sinA * oddRe[k] + cosA * oddIm[k];

            re[k] = evenRe[k] + tRe;
            im[k] = evenIm[k] + tIm;
            re[k + n / 2] = evenRe[k] - tRe;
            im[k + n / 2] = evenIm[k] - tIm;
        }
    }

    // Prepare Arrays for x[n] and y[n]
    let reX = new Float64Array(state.x);
    let imX = new Float64Array(N);
    let reY = new Float64Array(state.y);
    let imY = new Float64Array(N);

    fftRadix2(reX, imX);
    fftRadix2(reY, imY);

    // Compute Magnitude (up to 10 Hz as in Figure 2 of document)
    const maxPlotFreq = Math.min(10, Fs / 2);
    state.fftFreqs = [];
    state.fftMagX = [];
    state.fftMagY = [];

    for (let k = 0; k < halfN; k++) {
        const freq = (k * Fs) / N;
        if (freq > maxPlotFreq) break;

        const magX = Math.sqrt(reX[k] * reX[k] + imX[k] * imX[k]);
        const magY = Math.sqrt(reY[k] * reY[k] + imY[k] * imY[k]);

        state.fftFreqs.push(freq.toFixed(2));
        state.fftMagX.push(magX);
        state.fftMagY.push(magY);
    }
}

// ==========================================
// KPI & METRICS CALCULATION
// ==========================================
function updateKPIs() {
    const Fs = 1 / state.Ts;
    document.getElementById('kpiN').textContent = state.N;
    document.getElementById('kpiFs').textContent = `${Fs.toFixed(1)} Hz`;
    document.getElementById('kpiTs').textContent = `Ts = ${state.Ts.toFixed(3)} s`;
    document.getElementById('kpiA').textContent = state.a.toFixed(2);
    document.getElementById('kpiNyquist').textContent = `${(Fs / 2).toFixed(1)} Hz`;

    const maxRaw = Math.max(...state.x);
    const maxFilt = Math.max(...state.y);
    document.getElementById('kpiPeak').textContent = `${maxRaw.toFixed(1)} pkts/s`;
    document.getElementById('kpiPeakFiltered').textContent = `Filtrado: ${maxFilt.toFixed(1)}`;

    // Variance & Standard Deviation
    const meanX = state.x.reduce((a, b) => a + b, 0) / state.x.length;
    const meanY = state.y.reduce((a, b) => a + b, 0) / state.y.length;
    const varX = state.x.reduce((a, b) => a + Math.pow(b - meanX, 2), 0) / state.x.length;
    const varY = state.y.reduce((a, b) => a + Math.pow(b - meanY, 2), 0) / state.y.length;
    const stdX = Math.sqrt(varX);
    const stdY = Math.sqrt(varY);

    document.getElementById('stdDevOriginal').textContent = `${stdX.toFixed(2)} pkts/s`;
    document.getElementById('stdDevFiltered').textContent = `${stdY.toFixed(2)} pkts/s`;

    const reductionPct = Math.max(0, ((varX - varY) / (varX || 1)) * 100);
    document.getElementById('smoothEfficiency').textContent = `${reductionPct.toFixed(1)}% atenuado`;
    document.getElementById('kpiVarianceRatio').textContent = `Var: ${reductionPct.toFixed(0)}% reducida`;

    // Attenuation in dB
    const attenDb = 10 * Math.log10((varY + 1e-6) / (varX + 1e-6));
    document.getElementById('kpiNoiseReduction').textContent = `${attenDb.toFixed(1)} dB`;

    // Pole & Schur stability
    const isStable = Math.abs(state.a) < 1;
    const stabEl = document.getElementById('kpiStability');
    const zStabTag = document.getElementById('zStabilityTag');
    const poleEl = document.getElementById('poleCoords');

    if (isStable) {
        stabEl.textContent = `|a| = ${state.a.toFixed(2)} < 1 (Estable)`;
        stabEl.className = 'text-[10px] text-emerald-400 font-semibold mt-0.5';
        zStabTag.textContent = `Estable (|z|=${state.a.toFixed(2)} < 1)`;
        zStabTag.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800';
    } else {
        stabEl.textContent = `|a| ≥ 1 (Inestable!)`;
        stabEl.className = 'text-[10px] text-rose-400 font-semibold mt-0.5';
        zStabTag.textContent = `Inestable (|z| ≥ 1)`;
        zStabTag.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800';
    }
    poleEl.textContent = `z = ${state.a.toFixed(2)} + 0j`;
}

// ==========================================
// CHART.JS INITIALIZATION & UPDATES
// ==========================================
function initCharts() {
    // Chart defaults for dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#1f2937';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

    // 1. Time Domain Chart (Figure 1)
    const ctxTime = document.getElementById('timeChart').getContext('2d');
    timeChart = new Chart(ctxTime, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Tráfico Original Ruidoso x[n]',
                    data: [],
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.08)',
                    borderWidth: 1.2,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Tráfico Filtrado y[n] (a = ' + state.a + ')',
                    data: [],
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    borderWidth: 2.2,
                    pointRadius: 0,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Tiempo (s)', color: '#64748b', font: { size: 11 } },
                    grid: { color: '#1e293b' }
                },
                y: {
                    title: { display: true, text: 'Paquetes / Segundo', color: '#64748b', font: { size: 11 } },
                    grid: { color: '#1e293b' }
                }
            }
        }
    });

    // 2. FFT Spectrum Chart (Figure 2 - Logarithmic)
    const ctxFft = document.getElementById('fftChart').getContext('2d');
    fftChart = new Chart(ctxFft, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Espectro Original X[k]',
                    data: [],
                    borderColor: '#94a3b8',
                    borderWidth: 1.2,
                    pointRadius: 0,
                    tension: 0.2
                },
                {
                    label: 'Espectro Filtrado Y[k]',
                    data: [],
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Frecuencia (Hz)', color: '#64748b', font: { size: 11 } },
                    grid: { color: '#1e293b' }
                },
                y: {
                    type: 'logarithmic',
                    title: { display: true, text: '|Magnitud| (Escala Log)', color: '#64748b', font: { size: 11 } },
                    grid: { color: '#1e293b' },
                    min: 1
                }
            }
        }
    });

    // 3. Impulse Response Chart (Stage 4)
    const ctxImp = document.getElementById('impulseChart').getContext('2d');
    impulseChart = new Chart(ctxImp, {
        type: 'bar',
        data: {
            labels: Array.from({length: 25}, (_, i) => `n=${i}`),
            datasets: [{
                label: 'h[n] = aⁿ',
                data: [],
                backgroundColor: '#a855f7',
                borderRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    grid: { color: '#1e293b' }
                }
            }
        }
    });
}

function updateCharts() {
    if (!timeChart || !fftChart || !impulseChart) return;

    // Update Time Chart
    let limit = state.timeRange === 'all' ? state.N : parseInt(state.timeRange);
    limit = Math.min(limit, state.N);

    const displayTime = state.timeArr.slice(0, limit).map(t => t.toFixed(2));
    const displayX = state.x.slice(0, limit);
    const displayY = state.y.slice(0, limit);

    timeChart.data.labels = displayTime;
    timeChart.data.datasets[0].data = displayX;
    timeChart.data.datasets[1].data = displayY;
    timeChart.data.datasets[1].label = `Tráfico Filtrado y[n] (a = ${state.a.toFixed(2)})`;
    timeChart.update('none');

    // Update FFT Chart
    fftChart.data.labels = state.fftFreqs;
    fftChart.data.datasets[0].data = state.fftMagX;
    fftChart.data.datasets[1].data = state.fftMagY;
    fftChart.update('none');

    // Update Impulse Chart: h[n] = a^n
    const impulseData = Array.from({length: 25}, (_, n) => Math.pow(state.a, n));
    impulseChart.data.datasets[0].data = impulseData;
    impulseChart.update('none');

    drawZPlane();
}

// ==========================================
// Z-PLANE CANVAS VISUALIZATION
// ==========================================
function drawZPlane() {
    const canvas = document.getElementById('zPlaneCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 80; // Radius of unit circle in pixels

    ctx.clearRect(0, 0, w, h);

    // Grid Axes
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, cy);
    ctx.lineTo(w - 15, cy);
    ctx.moveTo(cx, 15);
    ctx.lineTo(cx, h - 15);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('Re', w - 18, cy - 6);
    ctx.fillText('Im', cx + 6, 20);
    ctx.fillText('1.0', cx + radius - 6, cy + 14);
    ctx.fillText('-1.0', cx - radius - 18, cy + 14);

    // Unit Circle |z| = 1
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill stable region lightly
    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Draw Pole 'a' (Cross symbol X)
    const polePx = cx + state.a * radius;
    const polePy = cy;
    const isStable = Math.abs(state.a) < 1;

    ctx.strokeStyle = isStable ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = 2.5;
    const size = 6;
    ctx.beginPath();
    ctx.moveTo(polePx - size, polePy - size);
    ctx.lineTo(polePx + size, polePy + size);
    ctx.moveTo(polePx - size, polePy + size);
    ctx.lineTo(polePx + size, polePy - size);
    ctx.stroke();

    // Pole label
    ctx.fillStyle = isStable ? '#fbbf24' : '#f87171';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.fillText(`Polo (z = ${state.a.toFixed(2)})`, polePx - 30, polePy - 12);
}

// ==========================================
// SAMPLE STEP INSPECTOR (Stage 3 & 4)
// ==========================================
function inspectSample(idx) {
    idx = parseInt(idx);
    if (idx >= state.x.length) idx = state.x.length - 1;
    if (idx < 1) idx = 1;

    document.getElementById('inspectSampleIdx').textContent = idx;
    const xVal = state.x[idx];
    const yPrevVal = state.y[idx - 1];
    const yVal = state.y[idx];
    const aVal = state.a;

    document.getElementById('inspX').textContent = xVal.toFixed(2);
    document.getElementById('inspYprev').textContent = yPrevVal.toFixed(2);
    document.getElementById('inspAyprev').textContent = (aVal * yPrevVal).toFixed(2);
    document.getElementById('inspY').textContent = yVal.toFixed(2);
}

// ==========================================
// EVENT HANDLERS & CONTROLS
// ==========================================
function updateParamA(val) {
    state.a = parseFloat(val);
    document.getElementById('valA').textContent = state.a.toFixed(2);
    generateSignalAndProcess();
}

function updateParamN(val) {
    state.N = parseInt(val);
    document.getElementById('valN').textContent = state.N;
    document.getElementById('sliderInspect').max = state.N - 1;
    generateSignalAndProcess();
}

function updateParamTs(val) {
    state.Ts = parseFloat(val);
    document.getElementById('valTs').textContent = `${state.Ts.toFixed(3)} s`;
    generateSignalAndProcess();
}

function updateNoise(val) {
    state.noiseLevel = parseFloat(val);
    document.getElementById('valNoise').textContent = `${state.noiseLevel.toFixed(1)} pkts/s`;
    generateSignalAndProcess();
}

function updateMean(val) {
    state.meanTraffic = parseFloat(val);
    document.getElementById('valMean').textContent = `${state.meanTraffic.toFixed(0)} pkts/s`;
    generateSignalAndProcess();
}

function updateTimeDomainRange(val) {
    state.timeRange = val;
    updateCharts();
}

function regenerateNoise() {
    generateSignalAndProcess();
}

function resetToDocDefaults() {
    state.a = 0.85;
    state.N = 1024;
    state.Ts = 0.01;
    state.noiseLevel = 8.0;
    state.meanTraffic = 60.0;
    state.scenario = 'doc';
    state.timeRange = 300;

    document.getElementById('sliderA').value = 0.85;
    document.getElementById('valA').textContent = '0.85';
    document.getElementById('selectN').value = '1024';
    document.getElementById('valN').textContent = '1024';
    document.getElementById('sliderTs').value = 0.01;
    document.getElementById('valTs').textContent = '0.010 s';
    document.getElementById('sliderNoise').value = 8.0;
    document.getElementById('valNoise').textContent = '8.0 pkts/s';
    document.getElementById('sliderMean').value = 60;
    document.getElementById('valMean').textContent = '60 pkts/s';
    document.getElementById('timeRangeSelect').value = '300';

    generateSignalAndProcess();
}

function loadScenario(type) {
    state.scenario = type;
    generateSignalAndProcess();
}

// ==========================================
// REAL-TIME LIVE STREAMING SIMULATION
// ==========================================
function toggleLiveStreaming() {
    state.isStreaming = !state.isStreaming;
    const icon = document.getElementById('streamIcon');
    const text = document.getElementById('streamText');
    const btn = document.getElementById('btnStreamToggle');

    if (state.isStreaming) {
        btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-700/50 transition';
        text.textContent = 'Detener Simulación';
        icon.setAttribute('data-lucide', 'square');
        lucide.createIcons();

        let stepCount = state.N;
        let lastY = state.y[state.y.length - 1] || state.meanTraffic;

        state.streamInterval = setInterval(() => {
            const t = stepCount * state.Ts;
            let newX = state.meanTraffic + 14 * Math.sin(2 * Math.PI * 0.55 * t) + (Math.random() - 0.5) * state.noiseLevel * 3;
            newX = Math.max(0, newX);

            let newY = (1 - state.a) * newX + state.a * lastY;
            lastY = newY;

            // Push and pop buffer
            state.x.shift();
            state.x.push(newX);
            state.y.shift();
            state.y.push(newY);
            state.timeArr.shift();
            state.timeArr.push(t);

            stepCount++;

            computeFFT();
            updateKPIs();
            updateCharts();
        }, 80);
    } else {
        clearInterval(state.streamInterval);
        btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-700/50 transition';
        text.textContent = 'Simulación en Vivo';
        icon.setAttribute('data-lucide', 'play');
        lucide.createIcons();
    }
}

// ==========================================
// CUSTOM DATA MODAL & FILE PROCESSING
// ==========================================
function openCustomDataModal() {
    document.getElementById('customDataModal').classList.remove('hidden');
}

function closeCustomDataModal() {
    document.getElementById('customDataModal').classList.add('hidden');
}

function openInfoModal() {
    document.getElementById('infoModal').classList.remove('hidden');
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.add('hidden');
}

function validateCustomDataInput() {
    const txt = document.getElementById('customDataTextarea').value;
    const values = extractNumbers(txt);
    document.getElementById('customDataCount').textContent = `${values.length} muestras detectadas`;
}

function extractNumbers(text) {
    const parts = text.split(/[\s,;\n\r\t]+/).filter(Boolean);
    return parts.map(p => parseFloat(p)).filter(v => !isNaN(v));
}

function loadSampleText(type) {
    let sample = [];
    if (type === 'burst') {
        for (let i = 0; i < 60; i++) {
            let v = 50 + Math.sin(i / 3) * 10;
            if (i >= 20 && i <= 35) v += 50 + Math.random() * 20;
            sample.push(v.toFixed(1));
        }
    } else if (type === 'square') {
        for (let i = 0; i < 60; i++) {
            sample.push(Math.floor(i / 10) % 2 === 0 ? "80.0" : "30.0");
        }
    } else if (type === 'triangle') {
        for (let i = 0; i < 60; i++) {
            sample.push((30 + (i % 20) * 3).toFixed(1));
        }
    }
    document.getElementById('customDataTextarea').value = sample.join(', ');
    validateCustomDataInput();
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target.result;
        document.getElementById('customDataTextarea').value = content;
        validateCustomDataInput();
    };
    reader.readAsText(file);
}

function applyCustomData() {
    const txt = document.getElementById('customDataTextarea').value;
    const values = extractNumbers(txt);

    if (values.length < 8) {
        alert('Por favor ingrese al menos 8 muestras numéricas.');
        return;
    }

    // Next power of 2 for FFT
    let nextPow2 = 256;
    if (values.length > 256) nextPow2 = 512;
    if (values.length > 512) nextPow2 = 1024;
    if (values.length > 1024) nextPow2 = 2048;

    state.N = nextPow2;
    document.getElementById('selectN').value = nextPow2.toString();
    document.getElementById('valN').textContent = nextPow2;

    // Zero pad or repeat to fill N
    state.x = new Array(nextPow2);
    for (let i = 0; i < nextPow2; i++) {
        state.x[i] = i < values.length ? values[i] : values[values.length - 1];
    }

    state.timeArr = new Array(nextPow2);
    for (let i = 0; i < nextPow2; i++) {
        state.timeArr[i] = i * state.Ts;
    }

    // Filter
    let yPrev = state.x[0];
    state.y = new Array(nextPow2);
    for (let n = 0; n < nextPow2; n++) {
        state.y[n] = (1 - state.a) * state.x[n] + state.a * yPrev;
        yPrev = state.y[n];
    }

    state.scenario = 'custom';
    computeFFT();
    updateKPIs();
    updateCharts();
    closeCustomDataModal();
}

// ==========================================
// EXPORT TO CSV
// ==========================================
function exportToCSV() {
    let csv = "Muestra_n,Tiempo_s,Trafico_Original_x_n,Trafico_Filtrado_y_n\n";
    for (let i = 0; i < state.N; i++) {
        csv += `${i},${state.timeArr[i].toFixed(4)},${state.x[i].toFixed(4)},${state.y[i].toFixed(4)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `trafico_red_filtrado_N${state.N}_a${state.a}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
