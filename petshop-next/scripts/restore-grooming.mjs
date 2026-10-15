import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
const schema = await readFile(new URL("../../schema", import.meta.url), "utf8");
const migration = await readFile(new URL("../../database/migrations/20260915_grooming_reservations.sql", import.meta.url), "utf8");
const section = (sql, table) => sql.match(new RegExp(`INSERT(?: IGNORE)? INTO ${table}[^;]*?VALUES([\\s\\S]*?);`))?.[1] || "";
const styles = [...section(schema, "grooming_styles").matchAll(/\((\d+), '([^']+)'\)/g)].map((m) => ({ oldId: Number(m[1]), name: m[2] }));
const pricing = [...section(schema, "style_size_pricing").matchAll(/\((\d+), '([^']+)', (\d+)\)/g)].map((m) => ({ oldId: Number(m[1]), size: m[2], price: m[3] }));
const addons = [...section(schema, "grooming_addons").matchAll(/\('([^']+)', (\d+)\)/g)].map((m) => ({ name: m[1], price: m[2] }));
const groomers = [...section(migration, "groomers").matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
const hours = migration.match(/SELECT groomer_id, days.day_number, '(\d{2}:\d{2}:\d{2})', '(\d{2}:\d{2}:\d{2})'/);
if (styles.length !== 5 || pricing.length !== 25 || addons.length !== 5 || groomers.length !== 2 || !hours) throw new Error("Original grooming sources changed; review them before restoration.");
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    for (const style of styles) {
      let record = await tx.groomingStyle.findFirst({ where: { styleName: style.name } });
      if (!record) {
        console.log(`${apply ? "Restoring" : "Would restore"} style: ${style.name}`);
        if (apply) record = await tx.groomingStyle.create({ data: { styleName: style.name } });
      }
      for (const item of pricing.filter((row) => row.oldId === style.oldId)) {
        const exists = record && await tx.styleSizePricing.findFirst({ where: { styleId: record.styleId, petSize: item.size } });
        if (!exists) {
          console.log(`${apply ? "Restoring" : "Would restore"} ${style.name} / ${item.size}: PHP ${item.price}`);
          if (apply) await tx.styleSizePricing.create({ data: { styleId: record.styleId, petSize: item.size, price: item.price } });
        }
      }
    }
    for (const item of addons) if (!await tx.groomingAddon.findFirst({ where: { addonName: item.name } })) {
      console.log(`${apply ? "Restoring" : "Would restore"} add-on: ${item.name}`);
      if (apply) await tx.groomingAddon.create({ data: { addonName: item.name, price: item.price } });
    }
    for (const name of groomers) {
      let groomer = await tx.groomer.findUnique({ where: { groomerName: name } });
      if (!groomer) {
        console.log(`${apply ? "Restoring" : "Would restore"} original groomer: ${name}`);
        if (apply) groomer = await tx.groomer.create({ data: { groomerName: name } });
      }
      // Preserve existing schedule configuration, including disabled days.
      if (groomer && await tx.groomerAvailability.count({ where: { groomerId: groomer.groomerId } })) continue;
      console.log(`${apply ? "Restoring" : "Would restore"} original schedule: ${name}, ${hours[1]}–${hours[2]}`);
      if (apply) await tx.groomerAvailability.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ groomerId: groomer.groomerId, dayOfWeek, startTime: new Date(`1970-01-01T${hours[1]}Z`), endTime: new Date(`1970-01-01T${hours[2]}Z`) })) });
    }
  }, { timeout: 15000 });
  console.log(apply ? "Verified original grooming setup restored; existing records preserved." : "Dry run complete. Pass --apply to restore missing entries.");
} finally { await prisma.$disconnect(); }
