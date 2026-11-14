// Motor Híbrido de Estimativa de Potência (Equação de Martin + Energia Cinética + Reserva Cardíaca)
window.UpYouPhysics = {
    getSettings() {
        const saved = localStorage.getItem('upyou_rider_physics');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return { riderWeight: 75.0, bikeWeight: 9.0, cda: 0.32, crr: 0.005 };
    },

    saveSettings(settings) {
        localStorage.setItem('upyou_rider_physics', JSON.stringify(settings));
    },

    estimateStreamPower(samples, maxHr = 187) {
        const cfg = this.getSettings();
        const totalMass = (parseFloat(cfg.riderWeight) || 75) + (parseFloat(cfg.bikeWeight) || 9);
        const cda = parseFloat(cfg.cda) || 0.32;
        const crr = parseFloat(cfg.crr) || 0.005;
        const rho = 1.20; // Densidade do ar (kg/m3)
        const g = 9.80665;
        const drivetrainLoss = 0.97;

        const estWatts = [];
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const prev = i > 0 ? samples[i - 1] : s;

            const dt = Math.max(1, (s.t || i) - (prev.t || Math.max(0, i - 1)));
            const v = Math.max(0, parseFloat(s.v) || 0); // Velocidade em m/s
            const vPrev = Math.max(0, parseFloat(prev.v) || 0);

            if (v < 0.8) {
                estWatts.push(0);
                continue;
            }

            const distDelta = Math.max(v * dt, (s.d || 0) - (prev.d || 0), 1.0);
            const elevDelta = (parseFloat(s.alt) || 0) - (parseFloat(prev.alt) || 0);
            // Limita gradiente entre -18% e +24% para filtrar ruído barométrico/GPS
            const grade = Math.max(-0.18, Math.min(0.24, elevDelta / distDelta));

            const pGravity = totalMass * g * Math.sin(Math.atan(grade)) * v;
            const pRolling = totalMass * g * Math.cos(Math.atan(grade)) * crr * v;
            const pAero = 0.5 * rho * cda * Math.pow(v, 3);

            const accel = Math.max(-1.5, Math.min(1.5, (v - vPrev) / dt));
            const pKinetic = totalMass * accel * v;

            let rawMechanical = (pGravity + pRolling + pAero + pKinetic) / drivetrainLoss;

            // Modulação fisiológica suave pela Frequência Cardíaca (quando disponível)
            if (s.hr && maxHr > 100) {
                const hrRatio = Math.min(1.05, Math.max(0.4, s.hr / maxHr));
                const hrRefWatts = Math.max(0, (hrRatio - 0.45) * 340);
                if (rawMechanical <= 0 && hrRatio > 0.72) {
                    rawMechanical = hrRefWatts * 0.45;
                } else {
                    rawMechanical = (rawMechanical * 0.82) + (hrRefWatts * 0.18);
                }
            }

            const clamped = Math.round(Math.max(0, Math.min(1200, rawMechanical)));
            estWatts.push(clamped);
        }

        // Suavização móvel de 5 segundos
        return estWatts.map((val, idx, arr) => {
            const start = Math.max(0, idx - 2);
            const end = Math.min(arr.length, idx + 3);
            const slice = arr.slice(start, end);
            return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
        });
    },

    computeNP(wattsArray) {
        if (!wattsArray || wattsArray.length === 0) return 0;
        if (wattsArray.length < 30) {
            const avg = wattsArray.reduce((a, b) => a + b, 0) / wattsArray.length;
            return Math.round(avg);
        }
        let sumFourth = 0;
        let count = 0;
        let rollingSum = 0;
        const windowSize = 30;

        for (let i = 0; i < wattsArray.length; i++) {
            rollingSum += wattsArray[i];
            if (i >= windowSize) {
                rollingSum -= wattsArray[i - windowSize];
            }
            if (i >= windowSize - 1) {
                const avg30 = rollingSum / windowSize;
                sumFourth += Math.pow(avg30, 4);
                count++;
            }
        }
        return count > 0 ? Math.round(Math.pow(sumFourth / count, 0.25)) : 0;
    }
};
