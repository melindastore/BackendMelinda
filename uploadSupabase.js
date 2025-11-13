import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import fs from "fs";

// 🧩 Configurações
const SUPABASE_URL = "https://ttyyovybhbkaikfosypy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eXlvdnliaGJrYWlrZm9zeXB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYyMjIzNywiZXhwIjoyMDc2MTk4MjM3fQ.wcGGX-6zft7MkxcdfrWXeVUxfbsUBdfRy4eys-KC9fQ"; // chave service_role
const BUCKET = "produtos"; // nome do bucket

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const pg = new PgClient({
  connectionString:
    "postgresql://neondb_owner:npg_EJpkOfcQ08LN@ep-steep-wind-adxr3sm1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

async function main() {
  await pg.connect();

  // 🔹 Busca todos os produtos com imagem base64
  const { rows } = await pg.query(
    "SELECT id, nome, imagem FROM produtos WHERE imagem IS NOT NULL;"
  );

  for (const produto of rows) {
    try {
      const { id, nome, imagem } = produto;
      if (!imagem) continue;

      // remove prefixo data:image/png;base64,...
      const base64Data = imagem.split(",")[1];
      const tipo = imagem.includes("png") ? "png" : "jpg";
      const fileName = `${id}_${nome.replace(/\s+/g, "_")}.${tipo}`;
      const buffer = Buffer.from(base64Data, "base64");

      // 🔸 envia pro Supabase
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, buffer, {
          contentType: tipo === "png" ? "image/png" : "image/jpeg",
          upsert: true,
        });

      if (error) {
        console.error(`❌ Erro ao enviar ${nome}:`, error.message);
        continue;
      }

      // 🔸 gera URL pública
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
      console.log(`✅ ${nome} → ${data.publicUrl}`);

      // 🔸 (opcional) salva no banco novo
      // await novoBanco.query("UPDATE produtos SET imagem_url = $1 WHERE id = $2", [data.publicUrl, id]);

    } catch (err) {
      console.error("Erro geral:", err.message);
    }
  }

  await pg.end();
  console.log("🚀 Upload concluído!");
}

main();
