// server.js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Koneksi Neon DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(express.json()); // Untuk parsing body JSON
app.use(express.urlencoded({ extended: true })); // Untuk parsing form
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Menyajikan file statis dari folder 'public'

// === Middleware Autentikasi ===
function authPageMiddleware(req, res, next) {
  if (req.cookies.auth === 'true') {
    next();
  } else {
    res.redirect('/login');
  }
}

function authApiMiddleware(req, res, next) {
  if (req.cookies.auth === 'true') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// === Routing Halaman ===
app.get('/',  (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/quiz',  (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});
app.get('/study',  (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'study.html'));
});
app.get('/login',  (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/dashboard', authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/panel-kosakata', authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel-kosakata.html'));
});
app.get('/panel-polakalimat', authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel-polakalimat.html'));
});
app.get('/create-quiz', authPageMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create-quiz.html'));
});

// === API Routes ===

// 1. Auth API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.cookie('auth', 'true', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Cookie 1 hari
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Username atau password salah' });
  }
});

app.get('/api/logout', (req, res) => {
  res.cookie('auth', '', { expires: new Date(0) });
  res.redirect('/login');
});

// 2. Chapters API (Bab)
app.get('/api/chapters', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM chapters ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapters', authApiMiddleware, async (req, res) => {
  const { title, description } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO chapters (title, description) VALUES ($1, $2) RETURNING *',
      [title, description]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/chapters/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE chapters SET title = $1, description = $2 WHERE id = $3 RETURNING *',
      [title, description, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chapters/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM chapters WHERE id = $1', [id]);
    res.json({ success: true, message: 'Bab berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Vocabularies API (Kosakata)
app.get('/api/vocabulary/:id', authApiMiddleware, async (req, res) => {
  // GET *satu* entri untuk diedit
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM vocabularies WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API untuk mengambil *semua* kosakata berdasarkan babId (UNTUK PUBLIC STUDY PAGE & ADMIN PANEL)
app.get('/api/vocabularies/:babId', async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM vocabularies WHERE bab_id = $1', [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== RUTE YANG HILANG DITAMBAHKAN DI SINI =====
app.post('/api/vocabularies', authApiMiddleware, async (req, res) => {
  const { bab_id, content } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO vocabularies (bab_id, content) VALUES ($1, $2) RETURNING *',
      [bab_id, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ==============================================

app.put('/api/vocabularies/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE vocabularies SET content = $1 WHERE id = $2 RETURNING *',
      [content, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vocabularies/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM vocabularies WHERE id = $1', [id]);
    res.json({ success: true, message: 'Konten berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Grammar Patterns API (Pola Kalimat)
app.post('/api/grammar', authApiMiddleware, async (req, res) => {
  const { bab_id, pattern, explanation, example } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO grammar_patterns (bab_id, pattern, explanation, example) VALUES ($1, $2, $3, $4) RETURNING *',
      [bab_id, pattern, explanation, example]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grammar/entry/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM grammar_patterns WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/grammar/:babId', async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM grammar_patterns WHERE bab_id = $1', [babId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/grammar/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  const { pattern, explanation, example } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE grammar_patterns SET pattern = $1, explanation = $2, example = $3 WHERE id = $4 RETURNING *',
      [pattern, explanation, example, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/grammar/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM grammar_patterns WHERE id = $1', [id]);
    res.json({ success: true, message: 'Pola kalimat berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Quizzes API
app.get('/api/quizzes/:babId', async (req, res) => {
  const { babId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, bab_id, question, option_a, option_b, option_c, option_d FROM quizzes WHERE bab_id = $1', 
      [babId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quiz/entry/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM quizzes WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quizzes/:id', authApiMiddleware, async (req, res) => {
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

app.delete('/api/quizzes/:id', authApiMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1', [id]);
    res.json({ success: true, message: 'Soal berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/quizzes/:babId', authApiMiddleware, async (req, res) => {
    const { babId } = req.params;
    try {
      const { rows } = await pool.query('SELECT * FROM quizzes WHERE bab_id = $1', [babId]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

app.post('/api/quizzes', authApiMiddleware, async (req, res) => {
  const { bab_id, question, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO quizzes (bab_id, question, option_a, option_b, option_c, option_d, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [bab_id, question, option_a, option_b, option_c, option_d, correct_answer]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API untuk submit kuis
app.post('/api/submit-quiz/:babId', async (req, res) => {
  const { babId } = req.params;
  const userAnswers = req.body.answers;

  try {
    const { rows: correctAnswers } = await pool.query(
      'SELECT id, correct_answer FROM quizzes WHERE bab_id = $1',
      [babId]
    );

    let score = 0;
    const totalQuestions = correctAnswers.length;
    const results = [];

    userAnswers.forEach(userAns => {
      const question = correctAnswers.find(q => q.id === userAns.questionId);
      if (question) {
        const isCorrect = question.correct_answer === userAns.answer;
        if (isCorrect) {
          score++;
        }
        results.push({
          questionId: userAns.questionId,
          isCorrect: isCorrect,
          correctAnswer: question.correct_answer
        });
      }
    });

    res.json({
      score: score,
      total: totalQuestions,
      results: results
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});