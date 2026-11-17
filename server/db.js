import sqlite3 from "sqlite3";
import { config } from "./config.js";

const sqlite = sqlite3.verbose();
export const db = new sqlite.Database(config.dbPath, (error) => {
  if (error) console.error("데이터베이스 연결 오류:", error.message);
  else console.log("데이터베이스 연결 성공:", config.dbPath);
});

function runDirect(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    if (error) reject(error);
    else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function allDirect(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}
function getDirect(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}
let queue = Promise.resolve();
function enqueue(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}
export const run = (sql, params = []) => enqueue(() => runDirect(sql, params));
export const all = (sql, params = []) => enqueue(() => allDirect(sql, params));
export const get = (sql, params = []) => enqueue(() => getDirect(sql, params));
export function transaction(operation) {
  return enqueue(async () => {
    await runDirect("BEGIN IMMEDIATE");
    try {
      const value = await operation({ run: runDirect, all: allDirect, get: getDirect });
      await runDirect("COMMIT");
      return value;
    } catch (error) {
      await runDirect("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}
