import { z } from 'zod';
import {
  ErrorResponseSchema,
  EntryResponseSchema,
  IdParamSchema
} from './schemas';

// ===== JSON Entry Schemas =====

export const CreateEntryJsonRequestSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  type: z.string().optional(),
  string_value: z.string().optional().nullable(),
  blob_value: z.string().optional().nullable(), // Base64 string
  json_value: z.any().optional(),
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
}).refine(data => {
  // Ensure mutual exclusivity
  const hasString = data.string_value !== undefined && data.string_value !== null;
  const hasBlob = data.blob_value !== undefined && data.blob_value !== null;
  const hasJson = data.json_value !== undefined && data.json_value !== null;

  const count = (hasString ? 1 : 0) + (hasBlob ? 1 : 0) + (hasJson ? 1 : 0);
  return count === 1;
}, {
  message: "Exactly one of string_value, blob_value, or json_value must be provided",
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
  json_value: z.any().optional(),
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
}).refine(data => {
  // If updating value, enforce exclusive check
  const hasString = data.string_value !== undefined && data.string_value !== null;
  const hasBlob = data.blob_value !== undefined && data.blob_value !== null;
  const hasJson = data.json_value !== undefined && data.json_value !== null;

  const count = (hasString ? 1 : 0) + (hasBlob ? 1 : 0) + (hasJson ? 1 : 0);
  return count <= 1;
}, {
  message: "Cannot provide more than one of string_value, blob_value, or json_value",
  path: ["string_value"]
});

export type CreateEntryJsonRequest = z.infer<typeof CreateEntryJsonRequestSchema>;
export type UpdateEntryJsonRequest = z.infer<typeof UpdateEntryJsonRequestSchema>;
