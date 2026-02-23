import type { EditableTarget } from "@/templates/hair1/editorSchema";
import { hair1EditorSchema } from "@/templates/hair1/editorSchema";

const SCHEMA_MAP: Record<string, EditableTarget[]> = {
  hair1: hair1EditorSchema,
  // Future: hair2: hair2EditorSchema, barber1: barber1EditorSchema, etc.
};

export function getEditorSchema(templateKey: string): EditableTarget[] {
  return SCHEMA_MAP[templateKey] ?? hair1EditorSchema;
}

export function getEditableTarget(
  templateKey: string,
  selectorId: string
): EditableTarget | undefined {
  return getEditorSchema(templateKey).find((t) => t.selectorId === selectorId);
}

export type { EditableTarget } from "@/templates/hair1/editorSchema";
