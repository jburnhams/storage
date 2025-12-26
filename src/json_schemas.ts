import { z } from 'zod';
import {
  ErrorResponseSchema,
  EntryResponseSchema,
  IdParamSchema
} from './schemas';

// ===== JSON Entry Schemas =====

export const CreateEntryJsonRequestSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  type: z.string().default('text/plain'),
  string_value: z.string().optional().nullable(),
  blob_value: z.string().optional().nullable(), // Base64 string
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
}).refine(data => {
  // Either string_value or blob_value must be provided, but not both
  const hasString = data.string_value !== undefined && data.string_value !== null;
  const hasBlob = data.blob_value !== undefined && data.blob_value !== null;
  return (hasString || hasBlob) && !(hasString && hasBlob);
}, {
  message: "Either string_value or blob_value must be provided, but not both",
  path: ["string_value"] // Attach error to string_value for now
});

export const BulkCreateEntryJsonRequestSchema = z.union([
  CreateEntryJsonRequestSchema,
  z.array(CreateEntryJsonRequestSchema)
]);

export const UpdateEntryJsonRequestSchema = z.object({
  key: z.string().min(1).optional(),
  type: z.string().optional(),
  string_value: z.string().optional().nullable(),
  blob_value: z.string().optional().nullable(), // Base64 string
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
}).refine(data => {
  // If updating value, enforce exclusive check
  const hasString = data.string_value !== undefined && data.string_value !== null;
  const hasBlob = data.blob_value !== undefined && data.blob_value !== null;
  if (hasString && hasBlob) {
    return false;
  }
  return true;
}, {
  message: "Cannot provide both string_value and blob_value",
  path: ["string_value"]
});

export type CreateEntryJsonRequest = z.infer<typeof CreateEntryJsonRequestSchema>;
export type UpdateEntryJsonRequest = z.infer<typeof UpdateEntryJsonRequestSchema>;
