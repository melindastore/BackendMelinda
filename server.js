import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pkg;

// ===========
// CONEXÕES
// ===========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = Fastify();
app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});


// ======================
// JWT MIDDLEWARE
// ======================
async function verificarAdmin(req, reply) {
  try {
    const auth = req.headers['authorization'];
    if (!auth) return reply.code(401).send({ error: 'Token não fornecido' });

    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.admin) {
      return reply.code(403).send({ error: 'Acesso negado' });
    }

    req.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido' });
  }
}

// ======================
// LOGIN
// ======================
app.post('/login', async (req, reply) => {
  const { usuario, senha } = req.body;

  const result = await pool.query(
    'SELECT * FROM admins WHERE usuario=$1 LIMIT 1',
    [usuario]
  );

  if (result.rows.length === 0)
    return reply.code(401).send({ error: 'Usuário não encontrado' });

  const admin = result.rows[0];
  const senhaValida = await bcrypt.compare(senha, admin.senha);
  if (!senhaValida)
    return reply.code(401).send({ error: 'Senha incorreta' });

  const token = jwt.sign(
    { id: admin.id, usuario: admin.usuario, admin: true },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  reply.send({ token });
});

// ======================
// LISTAR PRODUTOS
// ======================
app.get('/produtos', async () => {
 const result = await pool.query("SELECT * FROM produtos ORDER BY created_at DESC");
  return result.rows;
});

app.get('/produtos/:categoria', async (req) => {
  const { categoria } = req.params;
  const query =
    categoria === 'all'
      ? 'SELECT * FROM produtos ORDER BY id DESC'
      : 'SELECT * FROM produtos WHERE categoria = $1 ORDER BY created_at DESC';
  const params = categoria === 'all' ? [] : [categoria];
  const result = await pool.query(query, params);
  return result.rows;
});

// ======================
// CADASTRAR PRODUTO (com Supabase Storage)
// ======================
app.post('/produtos', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const parts = req.parts();
    let nome, descricao, preco, categoria, imagemUrl = '';

    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();

        // nome do arquivo único
        const fileName = `${Date.now()}-${part.filename}`;

        const { data, error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(fileName, buffer, {
            contentType: part.mimetype,
            upsert: false,
          });

        if (error) throw error;

        // gerar URL pública
        const { data: publicUrlData } = supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .getPublicUrl(fileName);

        imagemUrl = publicUrlData.publicUrl;
      } else {
        if (part.fieldname === 'nome') nome = part.value;
        if (part.fieldname === 'descricao') descricao = part.value;
        if (part.fieldname === 'preco') preco = part.value;
        if (part.fieldname === 'categoria') categoria = part.value;
      }
    }

    const result = await pool.query(
      `INSERT INTO produtos (nome, descricao, preco, imagem, categoria)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome, descricao, parseFloat(preco), imagemUrl, categoria]
    );

    reply.code(201).send(result.rows[0]);
  } catch (err) {
    console.error('Erro ao cadastrar produto:', err);
    reply.code(500).send({ error: 'Erro ao cadastrar produto' });
  }
});

// ======================
// EDITAR PRODUTO (com suporte a imagem)
// ======================
app.put('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;
    const parts = req.parts();

    let nome, descricao, preco, categoria;
    let imagemUrl = null; // só altera se enviar nova imagem

    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        const fileName = `${Date.now()}-${part.filename}`;

        const { data, error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(fileName, buffer, {
            contentType: part.mimetype,
            upsert: false,
          });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .getPublicUrl(fileName);

        imagemUrl = publicUrlData.publicUrl;
      } else {
        if (part.fieldname === 'nome') nome = part.value;
        if (part.fieldname === 'descricao') descricao = part.value;
        if (part.fieldname === 'preco') preco = part.value;
        if (part.fieldname === 'categoria') categoria = part.value;
      }
    }

    // pega imagem atual se não enviou nova
    if (!imagemUrl) {
      const { rows } = await pool.query('SELECT imagem FROM produtos WHERE id=$1', [id]);
      imagemUrl = rows[0]?.imagem || null;
    }

    const result = await pool.query(
      `UPDATE produtos
       SET nome=$1, descricao=$2, preco=$3, imagem=$4, categoria=$5
       WHERE id=$6 RETURNING *`,
      [nome, descricao, parseFloat(preco), imagemUrl, categoria, id]
    );

    reply.send(result.rows[0]);
  } catch (err) {
    console.error('Erro ao editar produto:', err);
    reply.code(500).send({ error: 'Erro ao editar produto' });
  }
});

// ======================
// EXCLUIR PRODUTO
// ======================
app.delete('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;

    // 1️⃣ Buscar a URL da imagem no banco antes de deletar
    const { rows } = await pool.query('SELECT imagem FROM produtos WHERE id=$1', [id]);
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Produto não encontrado' });
    }

    const imagemUrl = rows[0].imagem;

    // 2️⃣ Extrair o nome do arquivo da URL pública
    // Exemplo de URL: https://xyz.supabase.co/storage/v1/object/public/melinda-bucket/17397434345-produto.jpg
    const partes = imagemUrl.split('/');
    const fileName = partes[partes.length - 1]; // "17397434345-produto.jpg"

    // 3️⃣ Deletar o produto do banco
    await pool.query('DELETE FROM produtos WHERE id=$1', [id]);

    // 4️⃣ Tentar remover o arquivo do Supabase (sem quebrar se falhar)
    const { error: deleteError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .remove([fileName]);

    if (deleteError) {
      console.warn('⚠️ Erro ao excluir imagem do Supabase:', deleteError.message);
    }

    reply.send({ message: 'Produto e imagem excluídos com sucesso' });
  } catch (err) {
    console.error('Erro ao excluir produto:', err);
    reply.code(500).send({ error: 'Erro ao excluir produto' });
  }
});

/// ======================
// DEPOIMENTOS (TESTIMONIALS)
// ======================

// 📢 PÚBLICO — lista apenas depoimentos aprovados (verified = true)
app.get('/testimonials', async (req, reply) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, rating, comment, verified, date
      FROM testimonials
      WHERE verified = true
      ORDER BY date DESC
    `);
    reply.send(rows);
  } catch (err) {
    console.error('Erro ao buscar depoimentos públicos:', err);
    reply.code(500).send({ error: 'Erro ao carregar depoimentos' });
  }
});

// 🧑‍💼 ADMIN — lista todos (inclusive não verificados)
app.get('/admin/testimonials', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, rating, comment, verified, date
      FROM testimonials
      ORDER BY date DESC
    `);
    reply.send(rows);
  } catch (err) {
    console.error('Erro ao buscar depoimentos (admin):', err);
    reply.code(500).send({ error: 'Erro ao carregar depoimentos' });
  }
});

// ✍️ Adicionar novo depoimento (público)
app.post('/testimonials', async (req, reply) => {
  try {
    const { name, rating, comment } = req.body;

    if (!name || !rating || !comment) {
      return reply.code(400).send({ error: 'Campos obrigatórios ausentes' });
    }

    // garante que rating é número
    const numericRating = parseInt(rating, 10);

    const { rows } = await pool.query(
      `
      INSERT INTO testimonials (name, rating, comment, verified, date)
      VALUES ($1, $2, $3, false, NOW())
      RETURNING id, name, rating, comment, verified, date
      `,
      [name, numericRating, comment]
    );

    reply.code(201).send({
      message: 'Depoimento enviado! Aguarde aprovação do administrador.',
      testimonial: rows[0],
    });
  } catch (err) {
    console.error('Erro ao salvar depoimento:', err);
    reply.code(500).send({ error: 'Erro ao salvar depoimento' });
  }
});

// ✅ ADMIN — aprovar depoimento
app.put('/testimonials/:id/verify', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
      UPDATE testimonials
      SET verified = true
      WHERE id = $1
      RETURNING id, name, rating, comment, verified, date
      `,
      [id]
    );

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Depoimento não encontrado' });
    }

    reply.send({ message: 'Depoimento aprovado com sucesso!', testimonial: rows[0] });
  } catch (err) {
    console.error('Erro ao verificar depoimento:', err);
    reply.code(500).send({ error: 'Erro ao verificar depoimento' });
  }
});

// 🗑️ ADMIN — excluir depoimento
app.delete('/testimonials/:id', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM testimonials WHERE id = $1', [id]);
    reply.send({ message: 'Depoimento excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir depoimento:', err);
    reply.code(500).send({ error: 'Erro ao excluir depoimento' });
  }
});


// ======================
// INICIAR SERVIDOR
// ======================
app.listen({ 
  port: process.env.PORT || 3333, 
  host: '0.0.0.0' 
}).then(() => {
  console.log(`🚀 Servidor rodando em http://localhost:${process.env.PORT || 3333}`);
});

