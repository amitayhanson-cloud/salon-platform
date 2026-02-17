/**
 * Tests for client CSV import: mapRow (name + phone required; notes, clientType optional).
 */

import { describe, it, expect } from "vitest";
import { mapRow, autoDetectMapping, NAME_ERROR_MSG, PHONE_ERROR_MSG } from "./mapRow";
import type { ColumnMapping, RawRow } from "./types";

const mapping: ColumnMapping = {
  name: "name",
  phone: "phone",
  notes: "notes",
  clientType: "clientType",
};

describe("mapRow", () => {
  it("maps row with only name and phone", () => {
    const row: RawRow = { name: "דנה לוי", phone: "0541234567" };
    const { client, rowErrors } = mapRow(row, mapping, 0);
    expect(rowErrors).toHaveLength(0);
    expect(client.name).toBe("דנה לוי");
    expect(client.phone).toBe("0541234567");
    expect(client.notes).toBeUndefined();
    expect(client.clientType).toBeUndefined();
  });

  it("maps row with notes and clientType", () => {
    const row: RawRow = { name: "אבי כהן", phone: "052-987-6543", notes: "VIP", clientType: "VIP" };
    const { client, rowErrors } = mapRow(row, mapping, 0);
    expect(rowErrors).toHaveLength(0);
    expect(client.name).toBe("אבי כהן");
    expect(client.phone).toBe("0529876543");
    expect(client.notes).toBe("VIP");
    expect(client.clientType).toBe("VIP");
  });

  it("skips row with missing name and reports error", () => {
    const row: RawRow = { name: "", phone: "0501112233" };
    const { client, rowErrors } = mapRow(row, mapping, 0);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toBe(NAME_ERROR_MSG);
    expect(rowErrors[0].row).toBe(1);
    expect(client.phone).toBe("0501112233");
  });

  it("skips row with missing phone and reports error", () => {
    const row: RawRow = { name: "שרה", phone: "" };
    const { client, rowErrors } = mapRow(row, mapping, 2);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toBe(PHONE_ERROR_MSG);
    expect(rowErrors[0].row).toBe(3);
  });

  it("reports both errors when name and phone missing", () => {
    const row: RawRow = { name: "", phone: "abc" };
    const { rowErrors } = mapRow(row, mapping, 0);
    expect(rowErrors.length).toBeGreaterThanOrEqual(1);
    const messages = rowErrors.map((e) => e.message);
    expect(messages).toContain(PHONE_ERROR_MSG);
  });

  it("unknown clientType is passed through (resolution in server)", () => {
    const row: RawRow = { name: "Test", phone: "0540000000", clientType: "UnknownType" };
    const { client, rowErrors } = mapRow(row, mapping, 0);
    expect(rowErrors).toHaveLength(0);
    expect(client.clientType).toBe("UnknownType");
  });

  it("empty clientType is undefined", () => {
    const row: RawRow = { name: "Test", phone: "0540000000", clientType: "" };
    const { client } = mapRow(row, mapping, 0);
    expect(client.clientType).toBeUndefined();
  });
});

describe("autoDetectMapping", () => {
  it("maps name, phone, notes, clientType with template headers", () => {
    const headers = ["name", "phone", "notes", "clientType"];
    const m = autoDetectMapping(headers);
    expect(m.name).toBe("name");
    expect(m.phone).toBe("phone");
    expect(m.notes).toBe("notes");
    expect(m.clientType).toBe("clientType");
  });

  it("maps full name and telephone aliases", () => {
    const headers = ["Full Name", "Telephone", "Note", "Client Type"];
    const m = autoDetectMapping(headers);
    expect(m.name).toBe("Full Name");
    expect(m.phone).toBe("Telephone");
    expect(m.notes).toBe("Note");
    expect(m.clientType).toBe("Client Type");
  });

  it("maps mobile as phone", () => {
    const headers = ["name", "mobile"];
    const m = autoDetectMapping(headers);
    expect(m.phone).toBe("mobile");
  });
});
