import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pkg;

// Conexão com Neon / PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Conexão com Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = Fastify();
app.register(cors, { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });
app.register(multipart);

// ======================
// FUNÇÃO MIDDLEWARE JWT
// ======================
async function verificarAdmin(req, reply) {
  try {
    const auth = req.headers['authorization'];
    if (!auth) return reply.code(401).send({ error: 'Token não fornecido' });

    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.admin) return reply.code(403).send({ error: 'Acesso negado' });

    req.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido' });
  }
}

// ======================
// LOGIN DO ADMIN
// ======================
app.post('/login', async (req, reply) => {
  const { usuario, senha } = req.body;

  const result = await pool.query('SELECT * FROM admins WHERE usuario=$1 LIMIT 1', [usuario]);
  if (result.rows.length === 0) return reply.code(401).send({ error: 'Usuário não encontrado' });

  const admin = result.rows[0];
  const senhaValida = await bcrypt.compare(senha, admin.senha);
  if (!senhaValida) return reply.code(401).send({ error: 'Senha incorreta' });

  const token = jwt.sign({ id: admin.id, usuario: admin.usuario, admin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
  reply.send({ token });
});

// ======================
// LISTAR PRODUTOS (livre)
// ======================
app.get('/produtos', async () => {
  const result = await pool.query('SELECT * FROM produtos ORDER BY id DESC');
  return result.rows;
});

app.get('/produtos/:categoria', async (req) => {
  const { categoria } = req.params;
  if (categoria === 'all') {
    const result = await pool.query('SELECT * FROM produtos ORDER BY id DESC');
    return result.rows;
  }
  const result = await pool.query('SELECT * FROM produtos WHERE categoria = $1 ORDER BY id DESC', [categoria]);
  return result.rows;
});

// ======================
// CADASTRAR PRODUTO (só admin)
// ======================
app.post('/produtos', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const parts = req.parts();
    let nome, descricao, preco, categoria, imagemUrl = '';

    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        const ext = part.mimetype.split('/')[1] || 'png';
        const fileName = `produtos/${Date.now()}-${part.filename || 'img'}.${ext}`;

        const { error } = await supabase.storage.from('produtos').upload(fileName, buffer, { contentType: part.mimetype, upsert: true });
        if (error) return reply.code(500).send({ error: 'Erro ao enviar imagem para Supabase' });

        const { data } = supabase.storage.from('produtos').getPublicUrl(fileName);
        imagemUrl = data.publicUrl;
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
    console.error(err);
    reply.code(500).send({ error: 'Erro ao cadastrar produto' });
  }
});

// ======================
// EDITAR PRODUTO (só admin)
// ======================
app.put('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;
    let nome, descricao, preco, categoria, imagemUrl;

    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.file) {
          const buffer = await part.toBuffer();
          const ext = part.mimetype.split('/')[1] || 'png';
          const fileName = `produtos/${Date.now()}-${part.filename || 'img'}.${ext}`;

          const { error } = await supabase.storage.from('produtos').upload(fileName, buffer, { contentType: part.mimetype, upsert: true });
          if (error) return reply.code(500).send({ error: 'Erro ao enviar imagem para Supabase' });

          const { data } = supabase.storage.from('produtos').getPublicUrl(fileName);
          imagemUrl = data.publicUrl;
        } else {
          if (part.fieldname === 'nome') nome = part.value;
          if (part.fieldname === 'descricao') descricao = part.value;
          if (part.fieldname === 'preco') preco = part.value;
          if (part.fieldname === 'categoria') categoria = part.value;
        }
      }
    } else {
      const fields = req.body;
      nome = fields.nome;
      descricao = fields.descricao;
      preco = parseFloat(fields.preco);
      categoria = fields.categoria;
      imagemUrl = fields.imagem;
    }

    const result = await pool.query(
      `UPDATE produtos
       SET nome=$1, descricao=$2, preco=$3, imagem=$4, categoria=$5
       WHERE id=$6 RETURNING *`,
      [nome, descricao, preco, imagemUrl, categoria, id]
    );

    reply.send(result.rows[0]);
  } catch (err) {
    console.error(err);
    reply.code(500).send({ error: 'Erro ao editar produto' });
  }
});

// ======================
// EXCLUIR PRODUTO (só admin)
// ======================
app.delete('/produtos/:id', { preHandler: verificarAdmin }, async (req, reply) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM produtos WHERE id=$1', [id]);
    reply.send({ message: 'Produto excluído com sucesso' });
  } catch (err) {
    console.error(err);
    reply.code(500).send({ error: 'Erro ao excluir produto' });
  }
});

// ======================
// START SERVER
// ======================
app.listen({ port: process.env.PORT || 3333, host: '0.0.0.0' }).then(() => {
  console.log(`🚀 Servidor rodando em http://localhost:${process.env.PORT || 3333}`);
});










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




