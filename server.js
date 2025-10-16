import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { pool } from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Configura Supabase Storage
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 🔹 Configura upload de imagem (em memória)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 🔹 Middleware de autenticação JWT
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token não enviado" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
}

// 🧩 Login do admin
app.post("/login", async (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario !== process.env.ADMIN_USER) {
    return res.status(401).json({ error: "Usuário incorreto" });
  }

  const senhaValida = senha === process.env.ADMIN_PASS; // pode substituir por bcrypt se quiser
  if (!senhaValida) {
    return res.status(401).json({ error: "Senha incorreta" });
  }

  const token = jwt.sign({ usuario }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// 🧩 Listar todos os produtos
app.get("/produtos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM produtos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});

// 🧩 Listar por categoria
app.get("/produtos/:categoria", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM produtos WHERE categoria = $1 ORDER BY id DESC",
      [req.params.categoria]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao filtrar produtos" });
  }
});

// 🧩 Criar produto
app.post("/produtos", autenticar, upload.single("imagem"), async (req, res) => {
  try {
    const { nome, descricao, preco, categoria } = req.body;
    let imageUrl = null;

    if (req.file) {
      const fileName = `produtos/${Date.now()}-${req.file.originalname}`;
      const { data, error } = await supabase.storage
        .from("produtos")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (error) throw error;

      const { data: publicUrl } = supabase.storage.from("produtos").getPublicUrl(fileName);
      imageUrl = publicUrl.publicUrl;
    }

    const result = await pool.query(
      "INSERT INTO produtos (nome, descricao, preco, imagem, categoria) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [nome, descricao, preco, imageUrl, categoria]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});

// 🧩 Atualizar produto
app.put("/produtos/:id", autenticar, upload.single("imagem"), async (req, res) => {
  try {
    const { nome, descricao, preco, categoria } = req.body;
    let imageUrl = req.body.imagem || null;

    if (req.file) {
      const fileName = `produtos/${Date.now()}-${req.file.originalname}`;
      const { data, error } = await supabase.storage
        .from("produtos")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (error) throw error;

      const { data: publicUrl } = supabase.storage.from("produtos").getPublicUrl(fileName);
      imageUrl = publicUrl.publicUrl;
    }

    const result = await pool.query(
      `UPDATE produtos 
       SET nome=$1, descricao=$2, preco=$3, categoria=$4, imagem=$5 
       WHERE id=$6 RETURNING *`,
      [nome, descricao, preco, categoria, imageUrl, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});

// 🧩 Deletar produto
app.delete("/produtos/:id", autenticar, async (req, res) => {
  try {
    await pool.query("DELETE FROM produtos WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deletar produto" });
  }
});

// 🚀 Inicia servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));











// import 'dotenv/config';
// import Fastify from 'fastify';
// import cors from '@fastify/cors';
// import multipart from '@fastify/multipart';
// import pkg from 'pg';
// import jwt from 'jsonwebtoken';
// import bcrypt from 'bcrypt';

// const { Pool } = pkg;

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false }
// });

// const app = Fastify();
// app.register(cors, {
//   origin: '*',
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
// });
// app.register(multipart);

// // ======================
// // FUNÇÃO MIDDLEWARE JWT
// // ======================
// async function verificarAdmin(req, reply) {
//   try {
//     const auth = req.headers['authorization'];
//     if (!auth) return reply.code(401).send({ error: 'Token não fornecido' });

//     const token = auth.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     if (!decoded.admin) {
//       return reply.code(403).send({ error: 'Acesso negado' });
//     }

//     req.user = decoded;
//   } catch (err) {
//     return reply.code(401).send({ error: 'Token inválido' });
//   }
// }

// // ======================
// // LOGIN DO ADMIN
// // ======================
// app.post('/login', async (req, reply) => {
//   const { usuario, senha } = req.body;

//   const result = await pool.query(
//     'SELECT * FROM admins WHERE usuario=$1 LIMIT 1',
//     [usuario]
//   );
//   if (result.rows.length === 0) {
//     return reply.code(401).send({ error: 'Usuário não encontrado' });
//   }

//   const admin = result.rows[0];
//   const senhaValida = await bcrypt.compare(senha, admin.senha);

//   if (!senhaValida) {
//     return reply.code(401).send({ error: 'Senha incorreta' });
//   }

//   const token = jwt.sign(
//     { id: admin.id, usuario: admin.usuario, admin: true },
//     process.env.JWT_SECRET,
//     { expiresIn: '8h' }
//   );

//   reply.send({ token });
// });

// // ======================
// // LISTAR PRODUTOS (livre)
// // ======================
// app.get('/produtos', async () => {
//   const result = await pool.query('SELECT * FROM produtos ORDER BY id DESC');
//   return result.rows;
// });

// app.get('/produtos/:categoria', async (req) => {
//   const { categoria } = req.params;
//   if (categoria === 'all') {
//     const result = await pool.query('SELECT * FROM produtos ORDER BY id DESC');
//     return result.rows;
//   }
//   const result = await pool.query(
//     'SELECT * FROM produtos WHERE categoria = $1 ORDER BY id DESC',
//     [categoria]
//   );
//   return result.rows;
// });

// // ======================
// // CADASTRAR PRODUTO (só admin)
// // ======================
// app.post('/produtos', { preHandler: verificarAdmin }, async (req, reply) => {
//   try {
//     const parts = req.parts();
//     let nome, descricao, preco, categoria, imagem = '';

//     for await (const part of parts) {
//       if (part.file) {
//         const buffer = await part.toBuffer();
//         imagem = `data:${part.mimetype};base64,${buffer.toString('base64')}`;
//       } else {
//         if (part.fieldname === 'nome') nome = part.value;
//         if (part.fieldname === 'descricao') descricao = part.value;
//         if (part.fieldname === 'preco') preco = part.value;
//         if (part.fieldname === 'categoria') categoria = part.value;
//       }
//     }

//     const result = await pool.query(
//       `INSERT INTO produtos (nome, descricao, preco, imagem, categoria)
//        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
//       [nome, descricao, parseFloat(preco), imagem, categoria]
//     );

//     reply.code(201).send(result.rows[0]);
//   } catch (err) {
//     console.error(err);
//     reply.code(500).send({ error: 'Erro ao cadastrar produto' });
//   }
// });

// // ======================
// // EDITAR PRODUTO (só admin)
// // ======================
// app.put('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
//   try {
//     const { id } = req.params;
//     const fields = req.isMultipart() ? await req.body() : req.body;
//     const { nome, descricao, preco, categoria, imagem } = fields;

//     const result = await pool.query(
//       `UPDATE produtos
//        SET nome=$1, descricao=$2, preco=$3, imagem=$4, categoria=$5
//        WHERE id=$6 RETURNING *`,
//       [nome, descricao, parseFloat(preco), imagem, categoria, id]
//     );

//     reply.send(result.rows[0]);
//   } catch (err) {
//     console.error(err);
//     reply.code(500).send({ error: 'Erro ao editar produto' });
//   }
// });

// // ======================
// // EXCLUIR PRODUTO (só admin)
// // ======================
// app.delete('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
//   try {
//     const { id } = req.params;
//     await pool.query('DELETE FROM produtos WHERE id=$1', [id]);
//     reply.send({ message: 'Produto excluído com sucesso' });
//   } catch (err) {
//     console.error(err);
//     reply.code(500).send({ error: 'Erro ao excluir produto' });
//   }
// });

// app.listen({ 
//   port: process.env.PORT || 3333, 
//   host: '0.0.0.0' 
// }).then(() => {
//   console.log(`🚀 Servidor rodando em http://localhost:${process.env.PORT || 3333}`);
// });




