// import 'dotenv/config';
// import fs from 'fs';
// import pkg from 'pg';
// import { createClient } from '@supabase/supabase-js';

// const { Pool } = pkg;

// // Conexão com Neon
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });

// // Conexão com Supabase
// const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// // Config
// const DRY_RUN = process.env.DRY_RUN === 'true';

// // Função utilitária para definir extensão
// function extFromMime(mime) {
//   if (!mime) return '.bin';
//   if (mime.includes('jpeg')) return '.jpg';
//   if (mime.includes('png')) return '.png';
//   if (mime.includes('gif')) return '.gif';
//   if (mime.includes('webp')) return '.webp';
//   return '.bin';
// }

// // Função para enviar imagem ao Supabase
// async function uploadToSupabase(buffer, fileName, mimetype) {
//   const { error } = await supabase.storage.from('produtos').upload(fileName, buffer, {
//     contentType: mimetype,
//     upsert: true,
//   });
//   if (error) throw error;

//   const { data } = supabase.storage.from('produtos').getPublicUrl(fileName);
//   return data.publicUrl;
// }

// // Migração
// async function migrar() {
//   console.log('🔍 Buscando produtos no banco...');

//   const { rows } = await pool.query('SELECT id, nome, imagem FROM produtos ORDER BY id');
//   const results = [];
//   let migrated = 0, skipped = 0, failed = 0;

//   for (const produto of rows) {
//     const { id, nome, imagem } = produto;
//     const row = { id, nome, status: null, old: null, newUrl: null, error: null };

//     if (!imagem || !imagem.startsWith('data:')) {
//       row.status = 'sem_base64';
//       row.old = imagem;
//       skipped++;
//       results.push(row);
//       continue;
//     }

//     const matches = imagem.match(/^data:(.+);base64,(.*)$/);
//     if (!matches) {
//       row.status = 'base64_invalido';
//       row.old = imagem.substring(0, 120);
//       failed++;
//       results.push(row);
//       continue;
//     }

//     const mimetype = matches[1];
//     const buffer = Buffer.from(matches[2], 'base64');
//     const ext = extFromMime(mimetype);
//     const fileName = `produtos/${id}-${Date.now()}${ext}`;

//     try {
//       const url = await uploadToSupabase(buffer, fileName, mimetype);
//       row.old = imagem.substring(0, 120);
//       row.newUrl = url;

//       if (!DRY_RUN) {
//         await pool.query('UPDATE produtos SET imagem=$1 WHERE id=$2', [url, id]);
//         row.status = 'atualizado';
//       } else {
//         row.status = 'teste_ok';
//       }

//       migrated++;
//       console.log(`✅ Produto ${id} migrado: ${url}`);
//     } catch (err) {
//       row.status = 'erro';
//       row.error = err.message || String(err);
//       failed++;
//       console.error(`❌ Produto ${id} falhou: ${err.message || err}`);
//     }

//     results.push(row);
//   }

//   const outFile = `produtos_migrados_${Date.now()}.json`;
//   fs.writeFileSync(outFile, JSON.stringify({ date: (new Date()).toISOString(), DRY_RUN, migrated, skipped, failed, results }, null, 2));

//   console.log(`\n✨ Migração concluída. Migradas: ${migrated}, Puladas: ${skipped}, Falhas: ${failed}`);
//   console.log(`📄 Log salvo em: ${outFile}`);

//   await pool.end();
// }

// migrar().catch(err => {
//   console.error('Erro geral na migração:', err);
//   process.exit(1);
// });
