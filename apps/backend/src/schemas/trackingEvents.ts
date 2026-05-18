import { z } from "zod";

export const TRACKING_EVENT_TYPES = [
  "CLICK_LINK",
  "VIEW_VIDEO",
  "OPEN_EMAIL",
  "REPLY_MESSAGE",
  "OTHER",
] as const;

export const TRACKING_TARGET_KINDS = [
  "MESSAGE_TEMPLATE",
  "DOCUMENT_TEMPLATE",
  "EXTERNAL_URL",
  "CUSTOM",
] as const;

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

export const createTrackingEventSchema = z.object({
  eventType: z.enum(TRACKING_EVENT_TYPES),
  targetKind: z.enum(TRACKING_TARGET_KINDS),
  targetId: idSchema.optional().nullable(),
  targetLabel: z.string().min(1).max(500),
  targetUrl: z.string().url().optional().nullable(),
  processId: idSchema.optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const listTrackingEventsQuerySchema = z.object({
  since: z.string().datetime().optional(),
  processId: idSchema.optional(),
  eventType: z.enum(TRACKING_EVENT_TYPES).optional(),
});
