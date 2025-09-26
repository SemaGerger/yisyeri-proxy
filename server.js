const express = require("express");
const axios = require("axios");
const cors = require("cors");
const xml2js = require("xml2js");
require("dotenv").config();

const app = express();
app.use(cors());

const PORT = process.env.PORT;
const API_USERNAME = process.env.API_USERNAME;
const API_PASSWORD = process.env.API_PASSWORD;

// Global ses.
let sessionId = null;
let sessionExpiry = null;

async function login() {
  try {
    const res = await axios.get(
      "https://keos.bcekmece.bel.tr/BELNET/LogonService.asmx/Login",
      { 
        params: { username: API_USERNAME, password: API_PASSWORD },
      }
    );

    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
    sessionId = parsed?.string?._;
    sessionExpiry = Date.now() + 15 * 60 * 1000; // 15 dk geçerli
    console.log("✅ Yeni SessionId alındı:", sessionId);
    return sessionId;
  } catch (err) {
    console.error("❌ Login hatası:", err.message);
    sessionId = null;
    return null;
  }
}

// Partner veri
async function fetchPartners() {
  try {
    if (!sessionId || Date.now() > sessionExpiry) {
      await login();
    }

    const res = await axios.get(
      "https://keos.bcekmece.bel.tr/BELNET/gisapi/query/query",
      {
        params: { queryname: "vw_yesil_isyeri.Sorgusu", sessionid: sessionId },
      }
    );

    return res.data;
  } catch (err) {
    if (err.response?.status === 401) {
      console.warn("⚠️ 401 hatası: Session süresi bitmiş. Yeniden login olunuyor...");
      await login();
      return fetchPartners();
    }
    throw err;
  }
}

// Partnerler endpoint
app.get("/api/partners", async (req, res) => {
  try {
    const data = await fetchPartners();
    const rows = data.rows || data.Rows || [];

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || rows.length;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedRows = rows.slice(startIndex, endIndex);

    res.json({ total: rows.length, page, limit, rows: paginatedRows });
  } catch (err) {
    console.error("❌ Partner verisi alınamadı:", err.response?.data || err.message);
    res.status(500).json({ error: "Partner verisi alınamadı" });
  }
});

// Partner detay endpoint
app.get("/api/partners/:id", async (req, res) => {
  try {
    const data = await fetchPartners();
    const rows = data.Rows || [];

    const partner = rows.find(row => {
      const idCell = row.Cells.find(c => c.ColumnName === "vw_yesil_isyeri.objectid");
      return idCell && Number(idCell.Value) === Number(req.params.id);
    });

    if (!partner) return res.status(404).json({ message: "Partner bulunamadı" });

    const partnerObj = {};
    partner.Cells.forEach(c => {
      const key = c.ColumnName.replace("vw_yesil_isyeri.", "");
      partnerObj[key] = c.Value;
    });

    res.json(partnerObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Partner detayı alınamadı" });
  }
});




app.listen(PORT, () => {
  console.log(`✅ Server http://localhost:${PORT} üzerinde çalışıyor`);
});
