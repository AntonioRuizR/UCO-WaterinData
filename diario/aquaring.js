/* Utilidades comunes de las páginas de análisis de Aquaring (sin dependencias externas). */
const AQ = (function () {
  const H = window.AQ_HORAS || { cols: [], filas: [] };
  const CFG = window.AQ_CFG || { umbral_alto: 95, umbral_bajo: 5, eer_min_kwh: 0.2, dia_completo: 99 };
  const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const filas = H.filas.map(f => {
    const o = {};
    H.cols.forEach((c, i) => { o[c] = f[i]; });
    return o;
  });

  function modoVit(r) {        // recorrido del agua de vitrinas según V-3
    const v = r.V3;
    if (v == null) return null;
    if (v >= CFG.umbral_alto) return "aero";
    if (v <= CFG.umbral_bajo) return "deposito";
    return "reparto";
  }
  function modoBdc(r) {        // recorrido del agua de la BdC según V-12
    const v = r.V12;
    if (v == null) return null;
    if (v >= CFG.umbral_alto) return "fancoils";
    if (v <= CFG.umbral_bajo) return "deposito";
    return "reparto";
  }
  filas.forEach(r => {
    r.mVit = modoVit(r);
    r.mBdc = modoBdc(r);
    r.acs = r.V1 == null ? null : r.V1 > CFG.umbral_bajo;
    r.bdcOn = r.BdC_min == null ? null : r.BdC_min > 0;
    r.ventOn = r.Vent == null ? null : r.Vent > 0;
    const p = r.d.split("-").map(Number);
    r.dow = (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7;
    r.clave = r.d.replace(/-/g, "");
    let df = 0, hay = false;
    for (let k = 1; k <= 6; k++) { if (r["Dv" + k] != null) { hay = true; df += r["Dv" + k]; } }
    r.defrost = hay ? df > 0 : null;
  });

  const NOMBRES_MODO = {
    aero: "todo al aeroenfriador", deposito: "todo al depósito de inercia 1", reparto: "reparto",
    fancoils: "todo a los fan coils"
  };

  function fmt(v, n = 1) {
    if (v == null || !isFinite(v)) return "–";
    if (Math.abs(v) < 0.5 * Math.pow(10, -n)) v = 0;   // evita «-0,00»
    return Number(v).toLocaleString("es-ES", { minimumFractionDigits: n, maximumFractionDigits: n });
  }
  function media(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function suma(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  }
  function dias() { return [...new Set(filas.map(r => r.d))].sort(); }
  function fechaTxt(d) { const p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function diaSem(d) { const p = d.split("-").map(Number); return DIAS_SEM[(new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7]; }

  // EER de un conjunto de horas: frío STA-11 / electricidad BdC, sólo horas con la BdC trabajando
  function eer(rows) {
    const h = rows.filter(r => r.kWh_bdc != null && r.kWh_bdc >= CFG.eer_min_kwh && r.Q_frio != null);
    const e = suma(h.map(r => r.kWh_bdc)), q = suma(h.map(r => r.Q_frio));
    return e ? q / e : null;
  }

  // Resumen por día (a partir de las filas horarias)
  function porDia(rows) {
    const g = {};
    (rows || filas).forEach(r => { (g[r.d] = g[r.d] || []).push(r); });
    return Object.keys(g).sort().map(d => {
      const h = g[d];
      const completo = h.length === 24 && h.every(r => r.cob != null && r.cob >= CFG.dia_completo);
      return {
        d, h, completo, horas: h.length,
        kWh: suma(h.map(r => r.kWh)), kWh_bdc: suma(h.map(r => r.kWh_bdc)), kWh_aero: suma(h.map(r => r.kWh_aero)),
        kWh_vit: suma(h.map(r => r.kWh_vit)), Q_vit: suma(h.map(r => r.Q_vit)), Q_aero: suma(h.map(r => r.Q_aero)),
        Q_acs: suma(h.map(r => r.Q_acs)), Q_frio: suma(h.map(r => r.Q_frio)),
        Text: media(h.map(r => r.Text)), Tanillo: media(h.map(r => r.Tanillo)), Tint: media(h.map(r => r.Tint)),
        BdC_h: (suma(h.map(r => r.BdC_min)) || 0) / 60, eer: eer(h)
      };
    });
  }

  // Agrupa horas consecutivas en tramos de texto: [10,11,12,15] -> "10–13 h, 15–16 h"
  function tramos(horas) {
    const hs = [...horas].sort((a, b) => a - b), out = [];
    let i = 0;
    while (i < hs.length) {
      let j = i;
      while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j++;
      out.push([hs[i], hs[j] + 1]);
      i = j + 1;
    }
    return out;
  }

  function descargarCSV(nombre, cols, rows) {
    const esc = v => {
      if (v == null) return "";
      if (typeof v === "number") return String(v).replace(".", ",");
      const s = String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const txt = "﻿" + cols.join(";") + "\r\n" + rows.map(r => cols.map(c => esc(r[c])).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function hayPlotly() { return typeof window.Plotly !== "undefined"; }
  function avisoPlotly(el) {
    el.innerHTML = "<p class='nota'>No se ha podido cargar plotly.min.js: las gráficas no están disponibles " +
      "(los filtros y tablas sí funcionan). Ejecuta generar_informe_diario.bat con conexión a internet una vez.</p>";
  }
  const COLORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
  const LAYOUT_BASE = {
    font: { family: "system-ui, Segoe UI, Roboto, sans-serif", color: "#0b0b0b", size: 12 },
    plot_bgcolor: "white", paper_bgcolor: "white", margin: { l: 60, r: 20, t: 40, b: 50 },
    legend: { orientation: "h", y: 1.12, x: 0 }
  };
  const PCONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["select2d", "lasso2d"] };

  return { filas, cols: H.cols, CFG, NOMBRES_MODO, fmt, media, suma, dias, fechaTxt, diaSem, eer, porDia, tramos,
           descargarCSV, hayPlotly, avisoPlotly, COLORES, LAYOUT_BASE, PCONFIG, DIAS_SEM };
})();
