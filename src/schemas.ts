import { z } from 'zod';

// ===== Common Schemas =====

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ===== User & Session Schemas =====

export const UserResponseSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  profile_picture: z.string().nullable(),
  is_admin: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  last_login_at: z.string().nullable(),
});

export const SessionResponseSchema = z.object({
  id: z.string(),
  user_id: z.number(),
  created_at: z.string(),
  expires_at: z.string(),
  last_used_at: z.string(),
  user: UserResponseSchema.optional(),
});

export const PromoteAdminRequestSchema = z.object({
  email: z.string().email(),
});

export const UpdateUserRequestSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  is_admin: z.boolean().optional(),
  profile_picture: z.string().optional(),
  // For multipart, this is handled outside schema validation usually,
  // but we can add it here for type generation if needed, though usually string for multipart
});

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  is_admin: z.boolean().default(false),
  profile_picture: z.string().optional(),
});

// ===== Collection Schemas =====

export const CollectionContentEntrySchema = z.discriminatedUnion('type', [
  z.object({
    key: z.string(),
    type: z.literal('file'),
    mime_type: z.string(),
    url: z.string(),
  }),
  z.object({
    key: z.string(),
    type: z.literal('json'),
    value: z.any(),
  }),
  z.object({
    key: z.string(),
    type: z.literal('value'),
    value: z.string().nullable(),
  }),
]);

export const CollectionResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  secret: z.string(),
  user_id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z.string().nullable(),
  origin: z.string().nullable(),
});

export const CollectionWithContentsResponseSchema = CollectionResponseSchema.extend({
  contents: z.array(CollectionContentEntrySchema).optional(),
});

export const CreateCollectionRequestSchema = z.object({
  name: z.string().min(1, 'Collection name is required'),
  description: z.string().optional(),
  metadata: z.string().optional(),
});

export const UpdateCollectionRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  metadata: z.string().optional(),
});

// ===== Entry Schemas =====

export const EntryResponseSchema = z.object({
  id: z.number(),
  key: z.string(),
  string_value: z.string().nullable(),
  has_blob: z.boolean(),
  secret: z.string(),
  type: z.string(),
  filename: z.string().nullable(),
  user_id: z.number(),
  collection_id: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z.string().nullable(),
  origin: z.string().nullable(),
});

export const CreateEntryRequestSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string(),
  type: z.string().default('text/plain'),
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
});

export const UpdateEntryRequestSchema = z.object({
  key: z.string().min(1).optional(),
  value: z.string().optional(),
  type: z.string().optional(),
  filename: z.string().optional(),
  collection_id: z.number().nullable().optional(),
  metadata: z.string().optional(),
});

// ===== Query Parameter Schemas =====

export const ListEntriesQuerySchema = z.object({
  prefix: z.string().optional(),
  search: z.string().optional(),
  collection_id: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  offset: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  session: z.string().optional(),
});

export const GetCollectionQuerySchema = z.object({
  secret: z.string().optional(),
  session: z.string().optional(),
});

export const GetEntryQuerySchema = z.object({
  download: z.string().optional().transform((val) => val === 'true'),
  raw: z.string().optional().transform((val) => val === 'true'),
  session: z.string().optional(),
});

export const PublicShareQuerySchema = z.object({
  key: z.string(),
  secret: z.string(),
  raw: z.string().optional().transform((val) => val === 'true'),
  download: z.string().optional().transform((val) => val === 'true'),
});

export const ExportCollectionQuerySchema = z.object({
  secret: z.string().optional(),
  session: z.string().optional(),
});

// ===== Bulk Operation Schemas =====

export const BulkDownloadRequestSchema = z.object({
  entry_ids: z.array(z.number()).min(1, 'At least one entry ID is required'),
});

export const BulkExportRequestSchema = z.object({
  entry_ids: z.array(z.number()).min(1, 'At least one entry ID is required'),
});

export const BulkDeleteRequestSchema = z.object({
  entry_ids: z.array(z.number()).min(1, 'At least one entry ID is required'),
});

// ===== OAuth Schemas =====

export const AuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
  scope: z.string().optional(),
});

export const AuthLoginQuerySchema = z.object({
  redirect: z.string().optional(),
});

// ===== Path Parameter Schemas =====

export const IdParamSchema = z.object({
  id: z.string().transform((val, ctx) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid ID: must be a number',
      });
      return z.NEVER;
    }
    return parsed;
  }),
});

// ===== Response Lists =====

export const UserListResponseSchema = z.array(UserResponseSchema);
export const SessionListResponseSchema = z.array(SessionResponseSchema);
export const EntryListResponseSchema = z.array(EntryResponseSchema);
export const CollectionListResponseSchema = z.array(CollectionResponseSchema);

// ===== Type exports for compatibility with existing code =====

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type CollectionResponse = z.infer<typeof CollectionResponseSchema>;
export type CollectionWithContentsResponse = z.infer<typeof CollectionWithContentsResponseSchema>;
export type CollectionContentEntry = z.infer<typeof CollectionContentEntrySchema>;
export type EntryResponse = z.infer<typeof EntryResponseSchema>;
export type CreateEntryRequest = z.infer<typeof CreateEntryRequestSchema>;
export type UpdateEntryRequest = z.infer<typeof UpdateEntryRequestSchema>;
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;
export type PromoteAdminRequest = z.infer<typeof PromoteAdminRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type ListEntriesQuery = z.infer<typeof ListEntriesQuerySchema>;
export type GetCollectionQuery = z.infer<typeof GetCollectionQuerySchema>;
export type GetEntryQuery = z.infer<typeof GetEntryQuerySchema>;
export type PublicShareQuery = z.infer<typeof PublicShareQuerySchema>;
export type ExportCollectionQuery = z.infer<typeof ExportCollectionQuerySchema>;
export type BulkDownloadRequest = z.infer<typeof BulkDownloadRequestSchema>;
export type BulkExportRequest = z.infer<typeof BulkExportRequestSchema>;
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type AuthCallbackQuery = z.infer<typeof AuthCallbackQuerySchema>;
export type AuthLoginQuery = z.infer<typeof AuthLoginQuerySchema>;

// ===== Random Video Schemas =====

export const GetRandomVideosQuerySchema = z.object({
  count: z.string().optional().default('20').transform((val) => parseInt(val, 10)),
  min_duration: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  max_duration: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  channel_id: z.string().optional(),
});

export const RandomVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnail: z.string(),
  duration_seconds: z.number().nullable(),
  channel_id: z.string(),
  channel_title: z.string(),
  channel_thumbnail: z.string(),
  published_at: z.string(),
  view_count: z.number().nullable(),
});

export const RandomVideoResponseSchema = z.object({
  videos: z.array(RandomVideoSchema),
});

export type GetRandomVideosQuery = z.infer<typeof GetRandomVideosQuerySchema>;
export type RandomVideoResponse = z.infer<typeof RandomVideoResponseSchema>;
