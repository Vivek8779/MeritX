const express = require('express');
const duckdb = require('duckdb');
const path = require('path');
const cors = require('cors');

// Fix for BigInt serialization
BigInt.prototype.toJSON = function() { return this.toString(); };

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const db = new duckdb.Database(':memory:');
const con = db.connect();

console.log("Initializing database...");

con.exec(`
    CREATE TABLE cutoffs_raw AS SELECT * FROM read_csv_auto('cutoff_data.csv');
    CREATE TABLE cutoffs AS 
    SELECT 
        CAST("College Code" AS VARCHAR) AS "College Code",
        "College Name",
        "Course Name",
        CAST("CAP_Round" AS VARCHAR) AS "CAP_Round",
        "Admission Type",
        "Category",
        "2025",
        "Predicted_2026"
    FROM cutoffs_raw;
    DROP TABLE cutoffs_raw;
`, (err) => {
    if (err) console.error('❌ Error loading CSV:', err);
    else console.log('✅ Database Loaded Successfully.');
});

// API: Get Branches and Categories
app.get('/api/metadata', (req, res) => {
    con.all(`SELECT DISTINCT "Course Name" FROM cutoffs WHERE "Course Name" IS NOT NULL ORDER BY 1`, (err, branches) => {
        con.all(`SELECT DISTINCT "Category" FROM cutoffs WHERE "Category" IS NOT NULL ORDER BY 1`, (err2, cats) => {
            if (err || err2) return res.status(500).json({ error: "Metadata failed" });
            res.json({ 
                branches: branches.map(b => b["Course Name"]),
                categories: cats.map(c => c["Category"])
            });
        });
    });
});

// API: Get Search Results
app.get('/api/predictions', (req, res) => {
    const { min, max, category, round, course } = req.query;
    const minVal = parseFloat(min) || 0;
    const maxVal = parseFloat(max) || 100;

    let query = `SELECT * FROM cutoffs WHERE Predicted_2026 >= ? AND Predicted_2026 <= ?`;
    let params = [minVal, maxVal];

    if (category && category !== 'ALL') {
        query += ` AND Category = ?`;
        params.push(category);
    }
    if (round && round !== 'ALL') {
        const rMap = { 'I': '1', 'II': '2', 'III': '3' };
        query += ` AND CAP_Round = ?`;
        params.push(rMap[round] || round);
    }
    if (course && course !== 'ALL') {
        query += ` AND "Course Name" = ?`;
        params.push(course);
    }

    query += ` ORDER BY Predicted_2026 DESC LIMIT 1000`;

    con.all(query, ...params, (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// Static files MUST be last
app.use(express.static(__dirname));

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});