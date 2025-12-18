
const db = require("./backend/db");

async function test() {
  try {
    console.log("Testing connection...");
    const [rows] = await db.query("SELECT 1 as val");
    console.log("Connection OK:", rows);

    console.log("Testing jp_conectada.services...");
    const [services] = await db.query("DESCRIBE jp_conectada.services");
    console.log("Services columns:", services.map(c => c.Field));

    console.log("Testing jp_conectada.sectors...");
    const [sectors] = await db.query("DESCRIBE jp_conectada.sectors");
    console.log("Sectors columns:", sectors.map(c => c.Field));

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

test();
