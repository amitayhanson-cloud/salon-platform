/**
 * Tests for strict client import parser: first row = header, only name/phone/notes/client_type.
 */

import { describe, it, expect } from "vitest";
import { parseCSVStrict, parseFileStrict } from "./parse";

describe("parseCSVStrict", () => {
  it("parses CSV with correct headers (name, phone, notes, client_type)", async () => {
    const csv = "name,phone,notes,client_type\nJohn,0501234567,note1,Regular";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: "John",
      phone: "0501234567",
      notes: "note1",
      client_type: "Regular",
    });
    expect(result.rows[0].__rowNumber).toBe(2);
  });

  it("accepts optional columns missing (name, phone only)", async () => {
    const csv = "name,phone\nDana,0541112233";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Dana");
    expect(result.rows[0].phone).toBe("0541112233");
    expect(result.rows[0].notes).toBeUndefined();
    expect(result.rows[0].client_type).toBeUndefined();
  });

  it("strips BOM from header", async () => {
    const csv = "\uFEFFname,phone,notes,client_type\nDana,0541112233,,\n";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows[0].name).toBe("Dana");
    expect(result.rows[0].phone).toBe("0541112233");
  });

  it("fails when phone header is missing", async () => {
    const csv = "name,email,notes,client_type\nJohn,j@x.com,note,Regular";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]).toMatch(/phone|חובה|עמודות/);
  });

  it("fails when name header is missing", async () => {
    const csv = "fullname,phone,notes,client_type\nJohn,0501234567,note,Regular";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]).toMatch(/name|חובה|עמודות/);
  });

  it("fails when file has extra column", async () => {
    const csv = "name,phone,notes,client_type,email\nJohn,0501234567,note,Regular,j@x.com";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]).toMatch(/email|לא מורשות|אין להוסיף/);
  });

  it("skips row when name is empty and adds validation error", async () => {
    const csv = "name,phone,notes,client_type\n,0501234567,note,Regular\nJane,0529876543,,\n";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Jane");
    expect(result.validationErrors.some((e) => e.includes("שם חובה"))).toBe(true);
  });

  it("skips row when phone is empty and adds validation error", async () => {
    const csv = "name,phone,notes,client_type\nJohn,,note,Regular\nJane,0529876543,,\n";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Jane");
    expect(result.validationErrors.some((e) => e.includes("טלפון"))).toBe(true);
  });

  it("normalizes phone (removes spaces/dashes)", async () => {
    const csv = "name,phone,notes,client_type\nJohn,052-987-6543,,\n";
    const result = await parseCSVStrict(csv);
    expect(result.rows[0].phone).toBe("0529876543");
  });

  it("skips completely empty rows", async () => {
    const csv = "name,phone,notes,client_type\nJohn,0501234567,,\n\n\nJane,0529876543,,\n";
    const result = await parseCSVStrict(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe("John");
    expect(result.rows[1].name).toBe("Jane");
  });

  it("returns empty rows and error for empty file", async () => {
    const result = await parseCSVStrict("");
    expect(result.rows).toHaveLength(0);
    expect(result.validationErrors).toContain("הקובץ ריק.");
  });

  it("header is case-insensitive", async () => {
    const csv = "Name,Phone,Notes,Client_Type\nAlice,0501111111,note,Regular";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({ name: "Alice", phone: "0501111111", notes: "note", client_type: "Regular" });
  });

  it("accepts friendly client type header: Client Type (no underscore)", async () => {
    const csv = "name,phone,notes,Client Type\nBob,0521112233,remark,VIP";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({ name: "Bob", phone: "0521112233", notes: "remark", client_type: "VIP" });
  });

  it("accepts Hebrew client type header: סוג לקוח", async () => {
    const csv = "name,phone,notes,סוג לקוח\nDana,0549998877,,Regular";
    const result = await parseCSVStrict(csv);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({ name: "Dana", phone: "0549998877", client_type: "Regular" });
  });
});

describe("parseFileStrict", () => {
  it("rejects unsupported file type with error", async () => {
    const file = new File(["a,b,c"], "test.txt", { type: "text/plain" });
    const result = await parseFileStrict(file);
    expect(result.rows).toHaveLength(0);
    expect(result.validationErrors.some((e) => e.includes("לא נתמך") || e.includes("CSV") || e.includes("XLSX"))).toBe(true);
  });
});
