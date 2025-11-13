import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

// ⚙️ Configurações Supabase
const SUPABASE_URL = "https://ttyyovybhbkaikfosypy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eXlvdnliaGJrYWlrZm9zeXB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYyMjIzNywiZXhwIjoyMDc2MTk4MjM3fQ.wcGGX-6zft7MkxcdfrWXeVUxfbsUBdfRy4eys-KC9fQ"; // chave service_role
const BUCKET = "produtos"; // nome do bucket

// ⚙️ Configurações banco Neon NOVO
const pg = new PgClient({
  connectionString:
    "postgresql://neondb_owner:npg_rKOXgVA5ua8H@ep-lively-hill-ad1bygqb-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  await pg.connect();
  console.log("✅ Conectado ao banco Neon novo!");

  // 1️⃣ Lista os arquivos do bucket
  const { data: files, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
  });

  if (error) throw error;
  console.log(`📦 ${files.length} arquivos encontrados no Supabase`);

  for (const file of files) {
    const fileName = file.name; // exemplo: "1_Shampoo_XYZ.png"
    const id = parseInt(fileName.split("_")[0]);
    if (isNaN(id)) continue; // ignora arquivos sem ID no nome

    // 2️⃣ Gera link público
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const url = data.publicUrl;

    // 3️⃣ Atualiza coluna imagem no banco
    await pg.query("UPDATE produtos SET imagem = $1 WHERE id = $2", [url, id]);
    console.log(`✅ Produto ${id} atualizado com URL ${url}`);
  }

  await pg.end();
  console.log("🏁 Atualização concluída!");
}

main().catch((err) => console.error("❌ Erro:", err.message));
