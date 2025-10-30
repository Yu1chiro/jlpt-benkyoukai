require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Koneksi Neon DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Inisialisasi Tabel
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Hapus tabel lama jika ada
    await client.query("DROP TABLE IF EXISTS reading_exercises CASCADE");

    // Buat tabel baru untuk Wacana (Passages)
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_passages (
        id SERIAL PRIMARY KEY,
        bab_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        passage_content TEXT
      )
    `);

    // Buat tabel baru untuk Pertanyaan Wacana (Questions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_questions (
        id SERIAL PRIMARY KEY,
        passage_id INTEGER REFERENCES reading_passages(id) ON DELETE CASCADE,
        question_text TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer VARCHAR(1)
      )
    `);

    // [DIUBAH] Tabel listening (dengan kolom baru)
   await client.query(`
      CREATE TABLE IF NOT EXISTS listening_exercises (
        id SERIAL PRIMARY KEY,
        bab_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
        title TEXT,
        description TEXT,   -- BARU
        image_url TEXT,
        audio_url_1 TEXT,
        audio_url_2 TEXT,
        script TEXT 
      )
    `);

    // [DIUBAH] Blok ALTER untuk memastikan semua kolom ada
    try {
      await client.query(`ALTER TABLE listening_exercises ADD COLUMN IF NOT EXISTS description TEXT;`);
      await client.query(`ALTER TABLE listening_exercises ADD COLUMN IF NOT EXISTS image_url TEXT;`);
      await client.query(`ALTER TABLE listening_exercises ADD COLUMN IF NOT EXISTS audio_url_1 TEXT;`);
      await client.query(`ALTER TABLE listening_exercises ADD COLUMN IF NOT EXISTS audio_url_2 TEXT;`);
      await client.query(`ALTER TABLE listening_exercises ADD COLUMN IF NOT EXISTS script TEXT;`);
      
      // (Opsional) Hapus kolom 'audio_url' lama jika Anda yakin sudah tidak terpakai
      await client.query(`ALTER TABLE listening_exercises DROP COLUMN IF EXISTS audio_url;`); 

      console.log("Kolom 'listening_exercises' (image_url, audio_url_1, audio_url_2, script) berhasil divalidasi/ditambahkan.");
    } catch (alterErr) {
      console.error("Gagal memvalidasi kolom 'listening_exercises':", alterErr.message);
      // Jangan hentikan proses jika error
    }
    // [AKHIR PERUBAHAN]
    // ============================================

    await client.query("COMMIT");
    console.log("Semua tabel (passages, questions, listening) siap.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error saat inisialisasi tabel:", err);
  } finally {
    client.release();
  }
})();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// === Middleware Autentikasi ===
function authPageMiddleware(req, res, next) {
  if (req.cookies.auth === "true") {
    next();
  } else {
    res.redirect("/login");
  }
}

function authApiMiddleware(req, res, next) {
  if (req.cookies.auth === "true") {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// === Routing Halaman ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/quiz", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "quiz.html"));
});
app.get("/study", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "study.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/dashboard", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/panel-kosakata", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel-kosakata.html"));
});
app.get("/panel-polakalimat", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel-polakalimat.html"));
});
app.get("/create-quiz", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "create-quiz.html"));
});
app.get("/panel-dokkai", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel-dokkai.html"));
});

// [BARU] Rute Halaman Admin Choukai
app.get("/panel-choukai", authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel-choukai.html"));
});

// === API Routes ===

// 1. Auth API (Tidak Berubah)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.cookie("auth", "true", { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Username atau password salah" });
  }
});
app.get("/api/logout", (req, res) => {
  res.cookie("auth", "", { expires: new Date(0) });
  res.redirect("/login");
});

// 2. Chapters API (Tidak Berubah)
app.get("/api/chapters", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM chapters ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/chapters", authApiMiddleware, async (req, res) => {
  const { title, description } = req.body;
  try {
    const { rows } = await pool.query("INSERT INTO chapters (title, description) VALUES ($1, $2) RETURNING *", [title, description]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/chapters/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  try {
    const { rows } = await pool.query("UPDATE chapters SET title = $1, description = $2 WHERE id = $3 RETURNING *", [title, description, id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/chapters/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM chapters WHERE id = $1", [id]);
    res.json({ success: true, message: "Bab berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Vocabularies API (Tidak Berubah)
app.get("/api/vocabulary/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM vocabularies WHERE id = $1", [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/vocabularies/:babId", async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM vocabularies WHERE bab_id = $1", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/vocabularies", authApiMiddleware, async (req, res) => {
  const { bab_id, content } = req.body;
  try {
    const { rows } = await pool.query("INSERT INTO vocabularies (bab_id, content) VALUES ($1, $2) RETURNING *", [bab_id, content]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/vocabularies/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  try {
    const { rows } = await pool.query("UPDATE vocabularies SET content = $1 WHERE id = $2 RETURNING *", [content, id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/vocabularies/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM vocabularies WHERE id = $1", [id]);
    res.json({ success: true, message: "Konten berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Grammar Patterns API (Tidak Berubah)
app.post("/api/grammar", authApiMiddleware, async (req, res) => {
  const { bab_id, pattern, explanation, example } = req.body;
  try {
    const { rows } = await pool.query("INSERT INTO grammar_patterns (bab_id, pattern, explanation, example) VALUES ($1, $2, $3, $4) RETURNING *", [bab_id, pattern, explanation, example]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/grammar/entry/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM grammar_patterns WHERE id = $1", [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/grammar/:babId", async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM grammar_patterns WHERE bab_id = $1", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/grammar/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { pattern, explanation, example } = req.body;
  try {
    const { rows } = await pool.query("UPDATE grammar_patterns SET pattern = $1, explanation = $2, example = $3 WHERE id = $4 RETURNING *", [pattern, explanation, example, id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/grammar/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM grammar_patterns WHERE id = $1", [id]);
    res.json({ success: true, message: "Pola kalimat berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Quizzes API (Tidak Berubah)
app.get("/api/quizzes/:babId", async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query("SELECT id, bab_id, question, option_a, option_b, option_c, option_d FROM quizzes WHERE bab_id = $1", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/quiz/entry/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM quizzes WHERE id = $1", [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/quizzes/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { question, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE quizzes SET 
       question = $1, option_a = $2, option_b = $3, option_c = $4, option_d = $5, correct_answer = $6
       WHERE id = $7 RETURNING *`,
      [question, option_a, option_b, option_c, option_d, correct_answer, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/quizzes/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM quizzes WHERE id = $1", [id]);
    res.json({ success: true, message: "Soal berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/quizzes/:babId", authApiMiddleware, async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM quizzes WHERE bab_id = $1", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/quizzes", authApiMiddleware, async (req, res) => {
  const { bab_id, question, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    const { rows } = await pool.query("INSERT INTO quizzes (bab_id, question, option_a, option_b, option_c, option_d, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *", [
      bab_id,
      question,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_answer,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/submit-quiz/:babId", async (req, res) => {
  const { babId } = req.params;
  const userAnswers = req.body.answers;
  try {
    const { rows: correctAnswers } = await pool.query("SELECT id, correct_answer FROM quizzes WHERE bab_id = $1", [babId]);
    let score = 0;
    const totalQuestions = correctAnswers.length;
    const results = [];
    userAnswers.forEach((userAns) => {
      const question = correctAnswers.find((q) => q.id === userAns.questionId);
      if (question) {
        const isCorrect = question.correct_answer === userAns.answer;
        if (isCorrect) {
          score++;
        }
        results.push({
          questionId: userAns.questionId,
          isCorrect: isCorrect,
          correctAnswer: question.correct_answer,
        });
      }
    });
    res.json({
      score: score,
      total: totalQuestions,
      results: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Reading (Dokkai) API (Tidak Berubah)
app.get("/api/reading/:babId", async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.bab_id, p.passage_content, (
 SELECT json_agg(json_build_object(
   'id', q.id, 
   'question_text', q.question_text, 
   'option_a', q.option_a, 
   'option_b', q.option_b, 
   'option_c', q.option_c, 
   'option_d', q.option_d
 ))
 FROM reading_questions q 
 WHERE q.passage_id = p.id
) as questions 
FROM reading_passages p
WHERE p.bab_id = $1 
ORDER BY p.id ASC`,
      [babId]
    ); 
    const filteredRows = rows.map((row) => {
      if (row.questions && row.questions.length === 1 && row.questions[0].id === null) {
        row.questions = [];
      }
      return row;
    });
    res.json(filteredRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/reading/:babId (Untuk Panel Admin)
app.get("/api/admin/reading/:babId", authApiMiddleware, async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.bab_id, p.passage_content, (
         SELECT json_agg(json_build_object(
           'id', q.id,
           'passage_id', q.passage_id,
           'question_text', q.question_text,
           'option_a', q.option_a,
           'option_b', q.option_b,
           'option_c', q.option_c,
           'option_d', q.option_d,
           'correct_answer', q.correct_answer
         ) ORDER BY q.id ASC)
         FROM reading_questions q 
         WHERE q.passage_id = p.id
       ) as questions 
       FROM reading_passages p
       WHERE p.bab_id = $1 
       ORDER BY p.id ASC`,
      [babId]
    );
    const filteredRows = rows.map((row) => {
      if (row.questions && row.questions.length === 1 && row.questions[0] === null) {
        row.questions = [];
      }
      return row;
    });
    res.json(filteredRows);
  } catch (err) {
    console.error('Error di /api/admin/reading/:babId:', err);
    res.status(500).json({ error: err.message });
  }
});
// POST /api/reading/passage (Buat wacana + pertanyaannya)
app.post("/api/reading/passage", authApiMiddleware, async (req, res) => {
  const { bab_id, passage_content, questions } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); 
    const passageRes = await client.query("INSERT INTO reading_passages (bab_id, passage_content) VALUES ($1, $2) RETURNING id", [bab_id, passage_content]);
    const passageId = passageRes.rows[0].id; 

    if (questions && questions.length > 0) {
      for (const q of questions) {
        await client.query(
          `INSERT INTO reading_questions 
     (passage_id, question_text, option_a, option_b, option_c, option_d, correct_answer) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [passageId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer]
        );
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, passageId: passageId });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/reading/passage/:id (Ambil satu wacana + pertanyaan untuk diedit)
app.get("/api/reading/passage/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.*, (
 SELECT json_agg(q.* ORDER BY q.id ASC)
 FROM reading_questions q 
 WHERE q.passage_id = p.id
) as questions 
FROM reading_passages p
WHERE p.id = $1 
GROUP BY p.id`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Wacana tidak ditemukan" });
    }
    if (rows[0].questions && rows[0].questions.length === 1 && rows[0].questions[0].id === null) {
      rows[0].questions = [];
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reading/passage/:id (Update wacana + pertanyaannya)
app.put("/api/reading/passage/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params; 
  const { passage_content, questions } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); 
    await client.query("UPDATE reading_passages SET passage_content = $1 WHERE id = $2", [passage_content, id]); 

    await client.query("DELETE FROM reading_questions WHERE passage_id = $1", [id]); 

    if (questions && questions.length > 0) {
      for (const q of questions) {
        await client.query(
          `INSERT INTO reading_questions 
 (passage_id, question_text, option_a, option_b, option_c, option_d, correct_answer) 
 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer]
        );
      }
    }
    await client.query("COMMIT");
    res.json({ success: true, message: "Wacana berhasil diperbarui" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/reading/passage/:id (Hapus wacana dan semua pertanyaannya)
app.delete("/api/reading/passage/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM reading_passages WHERE id = $1", [id]);
    res.json({ success: true, message: "Wacana dan pertanyaannya berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// === [API BARU] Untuk submit latihan dokkai ===
app.post("/api/submit-reading/:babId", async (req, res) => {
  const { babId } = req.params;
  const userAnswers = req.body.answers; 

  try {
    const { rows: correctAnswers } = await pool.query(
      `SELECT q.id, q.correct_answer 
       FROM reading_questions q
       JOIN reading_passages p ON q.passage_id = p.id
       WHERE p.bab_id = $1`,
      [babId]
    );

    let score = 0;
    const totalQuestions = correctAnswers.length;
    const results = [];

    userAnswers.forEach((userAns) => {
      const question = correctAnswers.find((q) => q.id === userAns.questionId);
      if (question) {
        const isCorrect = question.correct_answer === userAns.answer;
        if (isCorrect) {
          score++;
        }
        results.push({
          questionId: userAns.questionId,
          isCorrect: isCorrect,
          correctAnswer: question.correct_answer,
        });
      }
    });

    res.json({
      score: score,
      total: totalQuestions,
      results: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/listening - Buat choukai baru
app.post("/api/listening", authApiMiddleware, async (req, res) => {
  // [DIUBAH] Tambahkan 'description'
  const { bab_id, title, description, image_url, audio_url_1, audio_url_2, script } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO listening_exercises 
       (bab_id, title, description, image_url, audio_url_1, audio_url_2, script) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      // [DIUBAH] Sesuaikan parameter
      [bab_id, title, description, image_url, audio_url_1, audio_url_2, script] 
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error di POST /api/listening:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/listening/:babId - Ambil semua choukai untuk study page (public)
app.get("/api/listening/:babId", async (req, res) => {
  const { babId } = req.params;
  try {
    // Ambil data (termasuk kolom baru)
    const { rows } = await pool.query("SELECT * FROM listening_exercises WHERE bab_id = $1 ORDER BY id ASC", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/listening/:babId - Ambil semua choukai untuk admin panel (auth)
app.get("/api/admin/listening/:babId", authApiMiddleware, async (req, res) => {
  const { babId } = req.params;
  try {
    // Ambil data (termasuk kolom baru)
    const { rows } = await pool.query("SELECT * FROM listening_exercises WHERE bab_id = $1 ORDER BY id ASC", [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/listening/entry/:id - Ambil satu choukai untuk diedit (auth)
app.get("/api/listening/entry/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    // Ambil data (termasuk kolom baru)
    const { rows } = await pool.query("SELECT * FROM listening_exercises WHERE id = $1", [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/listening/:id - Update satu choukai (auth)
app.put("/api/listening/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  // [DIUBAH] Tambahkan 'description'
  const { title, description, image_url, audio_url_1, audio_url_2, script } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE listening_exercises 
       SET title = $1, description = $2, image_url = $3, audio_url_1 = $4, audio_url_2 = $5, script = $6 
       WHERE id = $7 RETURNING *`,
      // [DIUBAH] Sesuaikan parameter
      [title, description, image_url, audio_url_1, audio_url_2, script, id] 
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Error di PUT /api/listening:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/listening/:id - Hapus satu choukai (auth)
app.delete("/api/listening/:id", authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM listening_exercises WHERE id = $1", [id]);
    res.json({ success: true, message: "Latihan mendengar berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});