// Creates an account or sets its password, on the server: the way the OWNER_EMAIL account is made
// (the website refuses to register that address). The password is typed hidden, never on the
// command line. Existing sessions of the account are signed out.
//   sudo -u qepik node scripts/set-password.mjs owner@example.com
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { hashPassword, passwordProblem } from "../lib/auth/password.mjs";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error("İstifadə: node scripts/set-password.mjs <e-poçt>");
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const input = process.stdin;
    process.stdout.write(question);
    if (!input.isTTY) {
      // Piped input only (tests, automation). Over SSH use `ssh -t` so the prompt is hidden.
      console.error(
        "\nXəbərdarlıq: terminal yoxdur, parol gizlədilə bilmir. `ssh -t` istifadə edin.",
      );
      let data = "";
      input.setEncoding("utf8");
      const done = () => {
        input.pause();
        resolve(data.split(/\r?\n/)[0]);
      };
      input.on("data", (c) => {
        data += c;
        if (/\r?\n/.test(data)) done();
      });
      input.on("end", done);
      return;
    }
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    input.on("data", onData);
  });
}

const password = await ask("Yeni parol: ");
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
if (process.stdin.isTTY && (await ask("Parolu təkrarlayın: ")) !== password) {
  console.error("Parollar eyni deyil.");
  process.exit(1);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const db = new DatabaseSync(path.resolve(root, process.env.DATABASE_PATH || "data/qepik.db"));
db.exec("PRAGMA busy_timeout = 10000;");
const hash = await hashPassword(password);
const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
if (existing) {
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, existing.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(existing.id);
  console.log(`Parol yeniləndi: ${email} (köhnə sessiyalar bağlandı).`);
} else {
  db.prepare("INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)").run(
    "u_" + randomBytes(12).toString("hex"),
    email,
    hash,
    Date.now(),
  );
  console.log(`Hesab yaradıldı: ${email}`);
}
db.close();
