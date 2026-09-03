/* SPMKB — hydrate data.json dari format ternormalisasi.
   Diskon memuat `members` (profile) + `scenarios` (delta per-pertemuan);
   helper ini merekonstruksi array penuh `wageData.Pertemuan1..5` di memori
   sehingga seluruh consumer (wages.js, reports.js, core.js, global search)
   tetap membaca shape lama tanpa perubahan.
   UMD: dipakai app (browser: globalThis) dan test.js (Node: module.exports). Pure, DOM-free. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.hydrateWageData = factory().hydrateWageData;
})(typeof self !== 'undefined' ? self : this, function () {
  var SCENARIOS = ['Pertemuan1', 'Pertemuan2', 'Pertemuan3', 'Pertemuan4', 'Pertemuan5'];
  var PROFILE = ['nama', 'department', 'bagian', 'jabatan', 'jobclass', 'gaji_pokok_2025'];
  var DELTA = ['x_in2025', 'x_pen2025', 'xtot', 'y_huruf', 'y_angka', 'ytot', 'z_angka', 'ztot', 'gaji_pokok_2026', 'total_kenaikan'];
  function hydrateWageData(data) {
    if (!data || !Array.isArray(data.members) || !data.scenarios) return data;
    var byNik = new Map(data.members.map(function (m) { return [String(m.nik), m]; }));
    SCENARIOS.forEach(function (s) {
      var deltas = data.scenarios[s] || [];
      data[s] = deltas.map(function (dr) {
        var m = byNik.get(String(dr.nik)) || {};
        var row = { no: dr.no, nik: dr.nik };
        PROFILE.forEach(function (f) { row[f] = m[f]; });
        DELTA.forEach(function (f) { row[f] = dr[f]; });
        return row;
      });
    });
    delete data.scenarios;
    return data;
  }
  return { hydrateWageData: hydrateWageData, SCENARIOS: SCENARIOS };
});
