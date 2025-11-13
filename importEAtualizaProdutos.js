import fs from "fs";
import csv from "csv-parser";
import { Client as PgClient } from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ⚙️ Configurações Supabase
const SUPABASE_URL = "https://ttyyovybhbkaikfosypy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eXlvdnliaGJrYWlrZm9zeXB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYyMjIzNywiZXhwIjoyMDc2MTk4MjM3fQ.wcGGX-6zft7MkxcdfrWXeVUxfbsUBdfRy4eys-KC9fQ"; // ⚠️ service_role key
const BUCKET = "produtos";

// ⚙️ Configurações banco Neon NOVO
const pg = new PgClient({
  connectionString:
    "postgresql://neondb_owner:npg_rKOXgVA5ua8H@ep-lively-hill-ad1bygqb-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// 🧩 Função principal
async function main() {
  await pg.connect();
  console.log("✅ Conectado ao banco Neon novo!");

  const produtos = [];

  // 1️⃣ Ler o CSV
  console.log("📄 Lendo arquivo produtos_sem_imagem.csv...");
  await new Promise((resolve, reject) => {
    fs.createReadStream("produtos_sem_imagem.csv")
      .pipe(csv())
      .on("data", (row) => produtos.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`📦 ${produtos.length} produtos encontrados no CSV.`);

  // 2️⃣ Inserir/atualizar no banco
  for (const p of produtos) {
    try {
      await pg.query(
        `INSERT INTO produtos (id, nome, descricao, preco, categoria)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE 
         SET nome = EXCLUDED.nome,
             descricao = EXCLUDED.descricao,
             preco = EXCLUDED.preco,
             categoria = EXCLUDED.categoria`,
        [p.id, p.nome, p.descricao, p.preco, p.categoria]
      );
      console.log(`✅ Produto ${p.id} importado (${p.nome})`);
    } catch (err) {
      console.error(`❌ Erro no produto ${p.id}:`, err.message);
    }
  }

  // 3️⃣ Buscar arquivos do Supabase
  console.log("🪣 Buscando imagens do Supabase...");
  const { data: files, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
  });

  if (error) throw error;
  console.log(`🖼️ ${files.length} arquivos encontrados no bucket.`);

  // 4️⃣ Atualizar imagens no banco
  for (const file of files) {
    const fileName = file.name;
    const id = parseInt(fileName.split("_")[0]);
    if (isNaN(id)) continue;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const url = data.publicUrl;

    await pg.query("UPDATE produtos SET imagem = $1 WHERE id = $2", [url, id]);
    console.log(`🧷 Produto ${id} vinculado à imagem ${fileName}`);
  }

  await pg.end();
  console.log("🏁 Importação e atualização concluídas com sucesso!");
}

// 🚀 Executar
main().catch((err) => console.error("❌ Erro geral:", err.message));
